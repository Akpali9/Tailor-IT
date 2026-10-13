import { serve, json, readJson, HttpError } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { paystack, stripe } from "../_shared/payments.ts";

serve(async (req) => {
  const { user, admin } = await requireAdmin(req);
  const { payment_id, amount_minor, reason } = await readJson<{ payment_id?: string; amount_minor?: number; reason?: string }>(req);
  if (!payment_id) throw new HttpError(400, "invalid_request");

  const { data: pay } = await admin.from("payments").select("*").eq("id", payment_id).single();
  if (!pay || !["succeeded", "refunded"].includes(pay.status)) throw new HttpError(409, "payment_not_refundable");
  const remaining = pay.amount_minor - pay.refunded_minor;
  const amount = amount_minor ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) throw new HttpError(400, "invalid_amount");

  if (pay.provider === "paystack") {
    await paystack("/refund", { body: { transaction: pay.reference, amount, customer_note: reason?.slice(0, 200), merchant_note: "Tailor IT admin refund" } });
  } else {
    await stripe("/refunds", { payment_intent: pay.provider_ref, amount, reverse_transfer: true, refund_application_fee: true, metadata: { reference: pay.reference } });
  }
  const { error } = await admin.rpc("apply_refund", { p_reference: pay.reference, p_amount: amount });
  if (error) throw new HttpError(500, "db_error", error.message);
  await admin.from("audit_log").insert({ admin_id: user.id, action: "refund", entity: "payment", entity_id: pay.id, details: { amount, reason: reason ?? null } });
  return json({ ok: true, refunded_minor: amount });
});
