import { serve, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { paystack, stripe } from "../_shared/payments.ts";

const PAYSTACK_COUNTRIES: Record<string, string> = { NG: "nigeria", GH: "ghana", KE: "kenya", ZA: "south africa" };
const PAYSTACK_CURRENCY: Record<string, string> = { NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR" };

serve(async (req) => {
  const ctx = await requireUser(req, "designer");
  const body = await readJson<Record<string, string>>(req);
  const uid = ctx.user.id;

  const save = async (provider: string, ref: string, ready: boolean, country: string, currency: string | null, details: Record<string, unknown> = {}) => {
    const { error } = await ctx.admin.from("designer_payout").upsert({ user_id: uid, provider, account_ref: ref, ready, country, currency, details, updated_at: new Date().toISOString() });
    if (error) throw new HttpError(500, "db_error", error.message);
    await ctx.admin.from("designer_profiles").update({ accepting_orders: ready }).eq("user_id", uid);
  };

  switch (body.action) {
    case "paystack_banks": {
      const country = PAYSTACK_COUNTRIES[body.country ?? "NG"];
      if (!country) throw new HttpError(400, "unsupported_country");
      const r = await paystack<{ data: { name: string; code: string }[] }>(`/bank?country=${encodeURIComponent(country)}&perPage=100&use_cursor=false`);
      return json({ banks: r.data.map((b) => ({ name: b.name, code: b.code })) });
    }
    case "paystack_resolve": {
      if (!/^\d{10}$/.test(body.account_number ?? "") || !body.bank_code) throw new HttpError(400, "invalid_account");
      const r = await paystack<{ data: { account_name: string } }>(`/bank/resolve?account_number=${body.account_number}&bank_code=${encodeURIComponent(body.bank_code)}`);
      return json({ account_name: r.data.account_name });
    }
    case "paystack_connect": {
      const cc = body.country ?? "NG";
      if (!PAYSTACK_COUNTRIES[cc]) throw new HttpError(400, "unsupported_country");
      if (!/^\d{10}$/.test(body.account_number ?? "") || !body.bank_code || !body.business_name) throw new HttpError(400, "invalid_account");
      const r = await paystack<{ data: { subaccount_code: string } }>("/subaccount", { body: {
        business_name: body.business_name.slice(0, 80), settlement_bank: body.bank_code, account_number: body.account_number, percentage_charge: 10,
      } });
      await save("paystack", r.data.subaccount_code, true, cc, PAYSTACK_CURRENCY[cc], { bank_code: body.bank_code, last4: body.account_number.slice(-4) });
      return json({ ready: true });
    }
    case "stripe_connect": {
      const { data: existing } = await ctx.admin.from("designer_payout").select("provider,account_ref").eq("user_id", uid).maybeSingle();
      let acct = existing?.provider === "stripe" ? existing.account_ref : null;
      if (!acct) {
        const country = (body.country ?? "US").toUpperCase();
        const a = await stripe<{ id: string }>("/accounts", {
          type: "express", country, email: ctx.user.email,
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { user_id: uid },
        });
        acct = a.id;
        await save("stripe", acct, false, country, null);
      }
      const fnUrl = env("PUBLIC_FUNCTIONS_URL");
      const link = await stripe<{ url: string }>("/account_links", {
        account: acct, type: "account_onboarding",
        refresh_url: `${fnUrl}/pay-return?provider=stripe_onboard`, return_url: `${fnUrl}/pay-return?provider=stripe_onboard`,
      });
      return json({ url: link.url });
    }
    case "status": {
      const { data: p } = await ctx.admin.from("designer_payout").select("*").eq("user_id", uid).maybeSingle();
      if (!p) return json({ connected: false, ready: false });
      if (p.provider === "stripe") {
        const a = await stripe<{ charges_enabled: boolean; details_submitted: boolean; default_currency?: string }>(`/accounts/${p.account_ref}`);
        const ready = a.charges_enabled && a.details_submitted;
        await save("stripe", p.account_ref, ready, p.country, a.default_currency?.toUpperCase() ?? null);
        return json({ connected: true, provider: "stripe", ready });
      }
      return json({ connected: true, provider: p.provider, ready: p.ready, last4: p.details?.last4 ?? null });
    }
    default:
      throw new HttpError(400, "invalid_action");
  }
});
