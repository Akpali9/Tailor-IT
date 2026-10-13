import { serve, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser, releaseQuota } from "../_shared/auth.ts";

serve(async (req) => {
  const ctx = await requireUser(req, "client");
  const { id } = await readJson<{ id?: string }>(req);
  if (!id) throw new HttpError(400, "invalid_request");
  const { data: row } = await ctx.admin.from("tryons").select("*").eq("id", id).eq("user_id", ctx.user.id).single();
  if (!row) throw new HttpError(404, "not_found");

  const signResult = async (path: string) => (await ctx.admin.storage.from("tryon-results").createSignedUrl(path, 3600)).data?.signedUrl ?? null;

  if (row.status === "completed" && row.result_path) return json({ status: "completed", url: await signResult(row.result_path) });
  if (row.status === "failed") return json({ status: "failed", error: row.error ?? "Try-on failed" });

  const res = await fetch(`https://api.fashn.ai/v1/status/${row.provider_job_id}`, {
    headers: { Authorization: `Bearer ${env("FASHN_API_KEY")}` }, signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, "tryon_unavailable");

  if (body.status === "completed" && Array.isArray(body.output) && body.output[0]) {
    const img = await fetch(body.output[0], { signal: AbortSignal.timeout(30_000) });
    if (!img.ok) throw new HttpError(502, "result_download_failed");
    const type = img.headers.get("content-type")?.startsWith("image/") ? img.headers.get("content-type")! : "image/png";
    const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
    const path = `${ctx.user.id}/${row.id}.${ext}`;
    const { error } = await ctx.admin.storage.from("tryon-results").upload(path, await img.arrayBuffer(), { contentType: type, upsert: true });
    if (error) throw new HttpError(500, "storage_error", error.message);
    await ctx.admin.from("tryons").update({ status: "completed", result_path: path, completed_at: new Date().toISOString() }).eq("id", row.id);
    const { data: p } = await ctx.admin.from("products").select("tryon_count").eq("id", row.product_id).single();
    if (p) await ctx.admin.from("products").update({ tryon_count: (p.tryon_count ?? 0) + 1 }).eq("id", row.product_id);
    return json({ status: "completed", url: await signResult(path) });
  }

  if (["failed", "canceled", "time_out"].includes(body.status)) {
    const msg = typeof body.error === "string" ? body.error : body.error?.message ?? "We couldn't generate this look. Try a clearer, full-length photo.";
    await ctx.admin.from("tryons").update({ status: "failed", error: String(msg).slice(0, 300) }).eq("id", row.id);
    await releaseQuota(ctx, "tryon");
    return json({ status: "failed", error: String(msg).slice(0, 300) });
  }
  return json({ status: "processing" });
});
