import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Header, Loading } from "@/components/ui";
import Icon from "@/components/Icon";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { useDesignerStats } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { friendly } from "@/lib/errors";
import { openUrl } from "@/lib/native";
import { money, shortDate } from "@/lib/format";
import { COUNTRIES, PAYSTACK_COUNTRIES } from "@/lib/countries";
import type { Payment } from "@/lib/types";

interface PayoutStatus { connected: boolean; ready: boolean; provider?: string; last4?: string | null }

export default function Payouts() {
  const toast = useToast();
  const qc = useQueryClient();
  const { designer, profile, priv, refresh } = useAuth();
  const stats = useDesignerStats();
  const status = useQuery({ queryKey: ["payout-status"], queryFn: () => api.payout<PayoutStatus>({ action: "status" }) });
  const payments = useQuery({ queryKey: ["designer-payments"], queryFn: async () => ((await supabase.from("payments").select("*").in("status", ["succeeded", "refunded"]).order("created_at", { ascending: false }).limit(20)).data ?? []) as Payment[] });
  const [change, setChange] = useState(false);
  const [country, setCountry] = useState(priv?.address?.country ?? profile?.country ?? "NG");
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bank, setBank] = useState("");
  const [acct, setAcct] = useState("");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState("");
  const paystack = PAYSTACK_COUNTRIES.includes(country);

  useEffect(() => {
    if (!paystack || banks.length) return;
    api.payout<{ banks: { name: string; code: string }[] }>({ action: "paystack_banks", country }).then((r) => setBanks(r.banks)).catch((e) => toast(friendly(e), "error"));
  }, [paystack, country]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBanks([]); setBank(""); setHolder(""); }, [country]);

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast(friendly(e), "error"); } finally { setBusy(""); } };
  const done = async () => { await refresh(); void qc.invalidateQueries({ queryKey: ["payout-status"] }); setChange(false); };

  const verify = () => run("verify", async () => { const r = await api.payout<{ account_name: string }>({ action: "paystack_resolve", account_number: acct, bank_code: bank }); setHolder(r.account_name); });
  const connect = () => run("connect", async () => {
    await api.payout({ action: "paystack_connect", country, bank_code: bank, account_number: acct, business_name: designer?.brand_name || profile?.full_name });
    toast("Payouts connected", "success"); await done();
  });
  const stripe = () => run("stripe", async () => { const r = await api.payout<{ url: string }>({ action: "stripe_connect", country }); await openUrl(r.url); });

  if (status.isLoading) return <><Header title="Payouts" back /><Loading /></>;
  const ready = status.data?.ready;
  const earn = stats.data?.earnings ?? [];
  return (
    <>
      <Header title="Payouts" subtitle="Get paid directly for your orders" back right={<span />} />
      <section className={`callout ${ready ? "ok" : "warn"}`}>
        <b><Icon name={ready ? "check" : "info"} size={15} /> {ready ? "Payouts connected" : status.data?.connected ? "Finish onboarding" : "Not connected"}</b>
        <p>{ready ? `Paid via ${status.data?.provider === "stripe" ? "Stripe" : "Paystack"}${status.data?.last4 ? ` · account ending ${status.data.last4}` : ""}. Clients can now order from you.` : "Connect where to receive your earnings. Clients can't order until this is done."}</p>
      </section>

      {earn.length > 0 && <section className="card"><h3>Net earnings</h3><div className="summary-rows">{earn.map((e) => <div key={e.currency}><span>{e.currency}</span><b>{money(e.net_minor, e.currency)}</b></div>)}</div><p className="fine">After the platform fee. Paid out to your account by the payment provider on its settlement schedule.</p></section>}

      {(!ready || change) && (
        <section className="card">
          <h3>{change ? "Change payout account" : "Connect payouts"}</h3>
          <Field label="Country of your bank account"><select value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
          {paystack ? (
            <>
              <Field label="Bank"><select value={bank} onChange={(e) => { setBank(e.target.value); setHolder(""); }}><option value="">{banks.length ? "Select your bank" : "Loading banks…"}</option>{banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select></Field>
              <Field label="Account number"><input inputMode="numeric" maxLength={10} value={acct} onChange={(e) => { setAcct(e.target.value.replace(/\D/g, "")); setHolder(""); }} placeholder="10 digits" /></Field>
              {holder ? <><p className="callout ok"><b>{holder}</b>Is this your account name?</p><Button className="full" loading={busy === "connect"} onClick={connect}>Yes, connect this account</Button></>
                : <Button className="full" disabled={!bank || acct.length !== 10} loading={busy === "verify"} onClick={verify}>Verify account</Button>}
            </>
          ) : (
            <><p className="fine">We use Stripe to verify your identity and pay you securely. You'll be taken to a Stripe page and brought back here.</p><Button className="full" loading={busy === "stripe"} onClick={stripe}>Continue with Stripe <Icon name="arrow" size={16} /></Button>
              {status.data?.connected && <Button variant="ghost" className="full" onClick={() => void status.refetch()}>I've finished — check status</Button>}</>
          )}
        </section>
      )}
      {ready && !change && <Button variant="secondary" className="full" onClick={() => setChange(true)}>Change payout account</Button>}

      <div className="section-title"><div><span>ACTIVITY</span><h2>Recent payments</h2></div></div>
      {(payments.data ?? []).length === 0 ? <p className="fine pad">No payments yet.</p> : <div className="payment-list card">{payments.data!.map((p) => (
        <div key={p.id}><span>{p.kind} · {shortDate(p.paid_at ?? p.created_at)}</span><b>{money(p.amount_minor, p.currency)}</b><small className={p.status}>{p.status}</small></div>
      ))}</div>}
    </>
  );
}
