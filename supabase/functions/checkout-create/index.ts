import { serve, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { paystack, stripe } from "../_shared/payments.ts";

type Kind = "full" | "deposit" | "balance";

serve(async (req) => {
  const ctx = await requireUser(req, "client");
  const { order_id, kind } = await readJson<{ order_id?: string; kind?: Kind }>(req);
  if (!order_id || !kind || !["full", "deposit", "balance"].includes(kind)) throw new HttpError(400, "invalid_request");

  const { data: order } = await ctx.admin.from("orders").select("*").eq("id", order_id).eq("client_id", ctx.user.id).single();
  if (!order) throw new HttpError(404, "order_not_found");
  const { data: payout } = await ctx.admin.from("designer_payout").select("provider,account_ref,ready").eq("user_id", order.designer_id).maybeSingle();
  if (!payout?.ready) throw new HttpError(409, "designer_not_accepting_payments");

  const { data: setting } = await ctx.admin.from("platform_settings").select("value").eq("key", "deposit_percent").single();
  const depositPct = Number(setting?.value ?? 50);

  // ---- decide the amount server-side; the client never sends one
  let amount = 0;
  let fee = 0;
  if (kind === "balance") {
    if (!(order.amount_paid_minor > 0) || ["pending_payment", "cancelled", "refunded", "delivered"].includes(order.status)) throw new HttpError(409, "balance_not_payable");
    amount = order.amount_minor - order.amount_paid_minor;
    if (amount <= 0) throw new HttpError(409, "nothing_due");
    const { data: done } = await ctx.admin.from("payments").select("fee_minor").eq("order_id", order.id).eq("status", "succeeded");
    fee = Math.max(0, order.fee_minor - (done ?? []).reduce((s, p) => s + p.fee_minor, 0));
  } else {
    if (order.status !== "pending_payment") throw new HttpError(409, "order_not_payable");
    if (kind === "deposit" && order.payment_plan !== "deposit") throw new HttpError(409, "plan_mismatch");
    if (kind === "full" && order.payment_plan !== "full") throw new HttpError(409, "plan_mismatch");
    amount = kind === "deposit" ? Math.round((order.amount_minor * depositPct) / 100) : order.amount_minor;
    fee = kind === "deposit" ? Math.round((order.fee_minor * amount) / order.amount_minor) : order.fee_minor;
  }
  if (fee >= amount) fee = Math.max(0, amount - 1);

  const reference = `TIT-${order.number}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const { error: insErr } = await ctx.admin.from("payments").insert({
    order_id: order.id, provider: payout.provider, reference, kind, amount_minor: amount, fee_minor: fee, currency: order.currency, status: "pending",
  });
  if (insErr) throw new HttpError(500, "db_error", insErr.message);

  const fnUrl = env("PUBLIC_FUNCTIONS_URL"); // e.g. https://<ref>.supabase.co/functions/v1
  try {
    if (payout.provider === "paystack") {
      const r = await paystack<{ data: { authorization_url: string } }>("/transaction/initialize", { body: {
        email: ctx.user.email, amount, currency: order.currency, reference,
        callback_url: `${fnUrl}/pay-return?provider=paystack`,
        subaccount: payout.account_ref, transaction_charge: fee, bearer: "account",
        metadata: { order_id: order.id, kind, order_number: order.number },
      } });
      return json({ url: r.data.authorization_url, reference, amount_minor: amount, currency: order.currency });
    }
    const ret = `${fnUrl}/pay-return?provider=stripe&reference=${reference}`;
    const s = await stripe<{ url: string }>("/checkout/sessions", {
      mode: "payment", client_reference_id: reference, customer_email: ctx.user.email,
      success_url: `${ret}&status=success`, cancel_url: `${ret}&status=cancelled`,
      line_items: [{ quantity: 1, price_data: {
        currency: order.currency.toLowerCase(), unit_amount: amount,
        product_data: { name: `${order.product_snapshot?.name ?? "Made-to-measure piece"} (${kind})`, description: `Tailor IT order TI-${order.number}` },
      } }],
      payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: payout.account_ref }, metadata: { reference, order_id: order.id } },
      metadata: { reference, order_id: order.id },
    });
    return json({ url: s.url, reference, amount_minor: amount, currency: order.currency });
  } catch (e) {
    await ctx.admin.rpc("fail_payment", { p_reference: reference, p_reason: "provider_init_failed" });
    throw e;
  }
});
