import { serve, json, readJson, HttpError } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { sendPush } from "../_shared/fcm.ts";

serve(async (req) => {
  const { db, admin } = await requireAdmin(req);
  const { broadcast_id } = await readJson<{ broadcast_id?: string }>(req);
  if (!broadcast_id) throw new HttpError(400, "invalid_request");

  // Fan-out as in-app notifications runs AS the admin so SQL re-checks is_admin() (MFA) itself.
  const { data: recipients, error } = await db.rpc("send_broadcast", { p_id: broadcast_id });
  if (error) throw new HttpError(error.message.includes("already_sent") ? 409 : 400, error.message.includes("already_sent") ? "already_sent" : "broadcast_failed", error.message);

  const { data: b } = await admin.from("broadcasts").select("title,body,send_push,deep_link").eq("id", broadcast_id).single();
  let pushSent = 0;
  if (b?.send_push) {
    // Page through recipients' device tokens (respecting each user's push setting).
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: rows } = await admin.from("notifications").select("user_id").eq("broadcast_id", broadcast_id).range(from, from + pageSize - 1);
      if (!rows?.length) break;
      const ids = rows.map((r) => r.user_id);
      const { data: prefs } = await admin.from("profile_private").select("user_id").in("user_id", ids).eq("push_enabled", true);
      const allowed = (prefs ?? []).map((p) => p.user_id);
      if (allowed.length) {
        const { data: tokens } = await admin.from("device_tokens").select("token").in("user_id", allowed);
        const res = await sendPush((tokens ?? []).map((t) => t.token), { title: b.title, body: b.body, data: { link: b.deep_link ?? "", broadcast_id } });
        pushSent += res.sent;
        if (res.invalidTokens.length) await admin.from("device_tokens").delete().in("token", res.invalidTokens);
      }
      if (rows.length < pageSize) break;
    }
    await admin.from("broadcasts").update({ push_sent_count: pushSent }).eq("id", broadcast_id);
  }
  return json({ recipients, push_sent: pushSent });
});
