import { serve, json, env, HttpError } from "../_shared/http.ts";
import { adminClient } from "../_shared/auth.ts";
import { paystack, verifyPaystackSignature, verifyStripeSignature } from "../_shared/payments.ts";

// Public endpoint (verify_jwt = false). Authenticity comes from the provider signature,
// and we never trust webhook payload amounts without checking them against our own payment row.
serve(async (req) => {
  const provider = new URL(req.url).searchParams.get("provider");
  const raw = await req.text();
  const admin = adminClient();

  if (provider === "paystack") {
    if (!(await verifyPaystackSignature(raw, req.headers.get("x-paystack-signature")))) throw new HttpError(401, "bad_signature");
    const event = JSON.parse(raw);
    if (event.event === "charge.success") {
      const ref = event.data?.reference as string;
      // Re-verify with Paystack so a forged-but-signed edge case can never mark an order paid.
      const v = await paystack<{ data: { status: string; amount: number; currency: string; id: number } }>(`/transaction/verify/${encodeURIComponent(ref)}`);
      if (v.data.status === "success") {
        const { data } = await admin.rpc("apply_payment", { p_reference: ref, p_provider_ref: String(v.data.id), p_amount: v.data.amount, p_currency: v.data.currency });
        console.log("paystack apply_payment", ref, JSON.stringify(data));
      }
    }
    return json({ received: true });
  }

  if (provider === "stripe") {
    if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature")))) throw new HttpError(401, "bad_signature");
    const event = JSON.parse(raw);
    const obj = event.data?.object ?? {};
    const ref = obj.client_reference_id ?? obj.metadata?.reference;
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && obj.payment_status === "paid" && ref) {
      const { data } = await admin.rpc("apply_payment", { p_reference: ref, p_provider_ref: String(obj.payment_intent ?? obj.id), p_amount: obj.amount_total, p_currency: String(obj.currency).toUpperCase() });
      console.log("stripe apply_payment", ref, JSON.stringify(data));
    } else if ((event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") && ref) {
      await admin.rpc("fail_payment", { p_reference: ref, p_reason: event.type });
    }
    return json({ received: true });
  }
  void env;
  throw new HttpError(400, "unknown_provider");
});
