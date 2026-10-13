import { serve, json, readJson, HttpError, b64encode } from "../_shared/http.ts";
import { requireUser, consumeQuota, releaseQuota } from "../_shared/auth.ts";
import { claudeTool, imageBlock } from "../_shared/claude.ts";

const KEYS = ["height", "chest_bust", "waist", "hips", "shoulder", "arm_length", "inseam", "neck", "thigh"] as const;

const SYSTEM = `You estimate approximate body measurements (in centimetres) from a single full-length photo, to give a made-to-measure tailoring app a STARTING POINT that the person will review and correct.
Rules:
- The person's stated height in cm is ground truth; use it to scale everything else.
- Photo-based estimates are inherently imprecise. Be conservative. If a measurement cannot be judged (clothing too loose, body partly hidden, bad angle), return null for it. Never guess wildly.
- Set "confidence" (0-100) for the overall estimate. Loose clothing, poor lighting, cropped body or odd angles must lower it.
- "tips" must be short, practical suggestions to improve accuracy (max 3).
- Do not comment on the person's body or appearance beyond measurement quality.
- If the image does not show a person, set confidence to 0 and every measurement to null.`;

const props: Record<string, unknown> = {};
for (const k of KEYS) props[k] = { type: ["number", "null"], description: `${k} in cm` };
const TOOL = {
  name: "report_estimate",
  description: "Report estimated measurements.",
  input_schema: {
    type: "object",
    properties: {
      measurements: { type: "object", properties: props, required: [...KEYS] },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      tips: { type: "array", items: { type: "string" }, maxItems: 3 },
    },
    required: ["measurements", "confidence", "tips"],
  },
};

serve(async (req) => {
  const ctx = await requireUser(req, "client");
  const { image_path, height_cm } = await readJson<{ image_path?: string; height_cm?: number }>(req);
  if (!image_path || !image_path.startsWith(`${ctx.user.id}/`) || image_path.includes("..")) throw new HttpError(400, "invalid_image_path");
  if (!height_cm || height_cm < 90 || height_cm > 230) throw new HttpError(400, "invalid_height");

  const { data: priv } = await ctx.admin.from("profile_private").select("ai_consent_at").eq("user_id", ctx.user.id).single();
  if (!priv?.ai_consent_at) throw new HttpError(403, "ai_consent_required");
  await consumeQuota(ctx, "measure");

  try {
    const { data: file, error } = await ctx.admin.storage.from("tryon-inputs").download(image_path);
    if (error || !file) throw new HttpError(404, "image_not_found");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 4_500_000) throw new HttpError(413, "image_too_large");
    const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";

    const out = await claudeTool<{ measurements: Record<string, number | null>; confidence: number; tips: string[] }>({
      system: SYSTEM,
      tool: TOOL,
      maxTokens: 700,
      messages: [{ role: "user", content: [
        imageBlock(bytes, mime, b64encode),
        { type: "text", text: `The person's height is ${height_cm} cm. Estimate their measurements.` },
      ] }],
    });

    const clean: Record<string, number> = {};
    for (const k of KEYS) {
      const v = out.measurements?.[k];
      if (typeof v === "number" && v > 5 && v < 260) clean[k] = Math.round(v * 10) / 10;
    }
    clean.height = height_cm; // user-supplied value always wins
    return json({ measurements: clean, confidence: Math.max(0, Math.min(100, Math.round(out.confidence ?? 0))), tips: (out.tips ?? []).slice(0, 3) });
  } catch (e) {
    await releaseQuota(ctx, "measure");
    throw e;
  }
});
