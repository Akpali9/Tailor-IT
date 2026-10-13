import { serve, json, env, HttpError, timingSafeEqual } from "../_shared/http.ts";
import { adminClient } from "../_shared/auth.ts";

// Scheduled (daily) retention job: try-on source photos are deleted after 7 days, results after 30.
serve(async (req) => {
  if (!timingSafeEqual(req.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) throw new HttpError(401, "unauthorized");
  const admin = adminClient();
  const removed: Record<string, number> = {};
  for (const [bucket, days] of [["tryon-inputs", 7], ["tryon-results", 30]] as const) {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const { data } = await admin.rpc("storage_expired_objects", { p_bucket: bucket, p_days: days });
      const names = (data ?? []).map((r: { name: string }) => r.name);
      if (!names.length) break;
      await admin.storage.from(bucket).remove(names);
      total += names.length;
    }
    removed[bucket] = total;
  }
  return json({ removed });
});
