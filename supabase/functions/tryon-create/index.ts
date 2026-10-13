import { serve, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser, consumeQuota, releaseQuota } from "../_shared/auth.ts";

serve(async (req) => {
  const ctx = await requireUser(req, "client");
  const { product_id, input_path } = await readJson<{ product_id?: string; input_path?: string }>(req);
  if (!product_id || !input_path || !input_path.startsWith(`${ctx.user.id}/`) || input_path.includes("..")) throw new HttpError(400, "invalid_request");

  const { data: priv } = await ctx.admin.from("profile_private").select("ai_consent_at").eq("user_id", ctx.user.id).single();
  if (!priv?.ai_consent_at) throw new HttpError(403, "ai_consent_required");

  const { data: product } = await ctx.admin.from("products").select("id,image_urls,status").eq("id", product_id).single();
  if (!product || product.status !== "live" || !product.image_urls?.length) throw new HttpError(404, "product_unavailable");

  await consumeQuota(ctx, "tryon");
  try {
    const { data: signed, error } = await ctx.admin.storage.from("tryon-inputs").createSignedUrl(input_path, 600);
    if (error || !signed) throw new HttpError(404, "image_not_found");

    const res = await fetch("https://api.fashn.ai/v1/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("FASHN_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ model_name: "tryon-v1.6", inputs: { model_image: signed.signedUrl, garment_image: product.image_urls[0] } }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.id) {
      console.error("fashn run failed", res.status, JSON.stringify(body));
      throw new HttpError(res.status === 429 ? 503 : 502, "tryon_unavailable");
    }
    const { data: row, error: insErr } = await ctx.admin.from("tryons").insert({
      user_id: ctx.user.id, product_id, input_path, provider: "fashn", provider_job_id: body.id, status: "processing",
    }).select("id,status").single();
    if (insErr) throw new HttpError(500, "db_error", insErr.message);
    return json({ id: row.id, status: row.status });
  } catch (e) {
    await releaseQuota(ctx, "tryon");
    throw e;
  }
});
