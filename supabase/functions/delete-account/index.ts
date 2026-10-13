import { serve, json, HttpError } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";

const BUCKETS = ["avatars", "tryon-inputs", "tryon-results", "product-images"];

// Satisfies App Store / Play Store in-app account deletion requirements.
serve(async (req) => {
  const ctx = await requireUser(req);
  const uid = ctx.user.id;
  const { data: blockers } = await ctx.admin.rpc("account_deletion_blockers", { p_user: uid });
  if ((blockers ?? 0) > 0) throw new HttpError(409, "active_orders", "Finish or cancel your active orders before deleting your account.");

  // Remove stored files.
  for (const bucket of BUCKETS) {
    const { data: files } = await ctx.admin.storage.from(bucket).list(uid, { limit: 1000 });
    if (files?.length) await ctx.admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
  }
  // Keep order records for accounting but strip personal data from them.
  await ctx.admin.from("orders").update({ measurements_snapshot: {}, delivery_address: {}, note: null }).eq("client_id", uid);
  const { error } = await ctx.admin.auth.admin.deleteUser(uid);
  if (error) throw new HttpError(500, "delete_failed", error.message);
  return json({ deleted: true });
});
