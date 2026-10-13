import { serve, json, readJson, env, HttpError, timingSafeEqual } from "../_shared/http.ts";
import { adminClient } from "../_shared/auth.ts";
import { sendPush } from "../_shared/fcm.ts";

// Called by the database (pg_net) after each notification insert.
serve(async (req) => {
  if (!timingSafeEqual(req.headers.get("x-webhook-secret") ?? "", env("PUSH_WEBHOOK_SECRET"))) throw new HttpError(401, "unauthorized");
  const { notification_id } = await readJson<{ notification_id?: number }>(req);
  if (!notification_id) throw new HttpError(400, "invalid_request");
  const admin = adminClient();
  const { data: n } = await admin.from("notifications").select("*").eq("id", notification_id).single();
  if (!n) return json({ skipped: "not_found" });
  const { data: priv } = await admin.from("profile_private").select("push_enabled").eq("user_id", n.user_id).single();
  if (!priv?.push_enabled) return json({ skipped: "push_disabled" });
  const { data: tokens } = await admin.from("device_tokens").select("token").eq("user_id", n.user_id);
  if (!tokens?.length) return json({ skipped: "no_devices" });
  const data: Record<string, string> = { notification_id: String(n.id), kind: n.kind };
  if (n.data?.order_id) data.order_id = String(n.data.order_id);
  if (n.data?.link) data.link = String(n.data.link);
  const res = await sendPush(tokens.map((t) => t.token), { title: n.title, body: n.body, data });
  if (res.invalidTokens.length) await admin.from("device_tokens").delete().in("token", res.invalidTokens);
  return json({ sent: res.sent });
});
