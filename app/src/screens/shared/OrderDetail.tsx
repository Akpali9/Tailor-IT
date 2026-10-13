import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ErrorState, Header, Loading, Sheet, StatusPill, statusLabel } from "@/components/ui";
import Icon from "@/components/Icon";
import { STAGES, progress } from "@/components/OrderCard";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { useOrder, usePlatformSettings } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { friendly } from "@/lib/errors";
import { startPayment } from "@/lib/pay";
import { money, orderNo, shortDate } from "@/lib/format";
import { MEASUREMENT_FIELDS, type OrderStatus } from "@/lib/types";

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { paid: "cutting", cutting: "assembly", assembly: "fitting_review", fitting_review: "finishing", finishing: "shipped", shipped: "delivered" };
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = { cutting: "Start cutting", assembly: "Move to assembly", fitting_review: "Ready for fitting review", finishing: "Move to finishing", shipped: "Mark as shipped", delivered: "Mark as delivered" };

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { profile } = useAuth();
  const { data, isLoading, isError, refetch } = useOrder(id);
  const { data: settings } = usePlatformSettings();
  const [busy, setBusy] = useState("");
  const [ship, setShip] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [trackNo, setTrackNo] = useState("");

  if (isLoading) return <><Header title="Order" back /><Loading /></>;
  if (isError || !data) return <><Header title="Order" back /><ErrorState onRetry={() => refetch()} /></>;
  const { order: o, events, payments } = data;
  const isClient = o.client_id === profile?.id;
  const isDesigner = o.designer_id === profile?.id;
  const depositPct = Number(settings?.deposit_percent ?? 50);
  const balance = o.amount_minor - o.amount_paid_minor;
  const active = (["paid", "cutting", "assembly", "fitting_review", "finishing"] as OrderStatus[]).includes(o.status);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["order", id] }); void qc.invalidateQueries({ queryKey: ["orders"] }); void qc.invalidateQueries({ queryKey: ["designer-stats"] }); };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(friendly(e), "error"); } finally { setBusy(""); }
  };
  const pay = (kind: "full" | "deposit" | "balance") => run(kind, async () => { await startPayment(o.id, kind); });
  const advance = (to: OrderStatus, tracking?: object) => run("adv", async () => {
    const { error } = await supabase.rpc("advance_order", { p_order: o.id, p_status: to, p_note: null, p_tracking: tracking ?? null });
    if (error) throw error;
    setShip(false); refresh(); toast("Order updated", "success");
  });
  const nextStatus = NEXT[o.status];

  return (
    <>
      <Header title={orderNo(o.number)} subtitle={o.product_snapshot.name} back right={<StatusPill status={o.status} />} />
      <section className="order-hero">
        {o.product_snapshot.image && <img src={o.product_snapshot.image} alt="" />}
        <div>
          <h2>{o.product_snapshot.name}</h2>
          <p>{[o.options.color, o.options.fit].filter(Boolean).join(" · ") || "Original design"}</p>
          <div className="order-progress"><i style={{ width: `${progress(o)}%` }} /></div>
          {o.estimated_delivery && !["delivered", "cancelled", "refunded"].includes(o.status) && <small>Estimated delivery {shortDate(o.estimated_delivery)}</small>}
        </div>
      </section>

      {o.tracking?.number && <section className="callout soft"><b><Icon name="bag" size={15} /> Shipping</b><p>{o.tracking.carrier} · {o.tracking.number}</p></section>}

      <section className="card">
        <h3>Payment</h3>
        <div className="summary-rows">
          <div><span>Total</span><b>{money(o.amount_minor, o.currency)}</b></div>
          <div><span>Paid</span><b>{money(o.amount_paid_minor, o.currency)}</b></div>
          {balance > 0 && o.amount_paid_minor > 0 && <div><span>Balance</span><b>{money(balance, o.currency)}</b></div>}
          {isDesigner && <div><span>Platform fee</span><b>{money(o.fee_minor, o.currency)}</b></div>}
        </div>
        {isClient && o.status === "pending_payment" && (
          <>
            <Button className="full" loading={busy === "full" || busy === "deposit"} onClick={() => pay(o.payment_plan === "deposit" ? "deposit" : "full")}>
              <Icon name="card" size={18} /> Pay {money(o.payment_plan === "deposit" ? Math.round(o.amount_minor * depositPct / 100) : o.amount_minor, o.currency)} now
            </Button>
            <Button variant="ghost" className="full" loading={busy === "cancel"} onClick={() => run("cancel", async () => { const { error } = await supabase.rpc("cancel_order", { p_order: o.id }); if (error) throw error; refresh(); toast("Order cancelled"); })}>Cancel order</Button>
          </>
        )}
        {isClient && active && balance > 0 && o.amount_paid_minor > 0 && (
          <Button className="full" loading={busy === "balance"} onClick={() => pay("balance")}><Icon name="card" size={18} /> Pay balance {money(balance, o.currency)}</Button>
        )}
        {isDesigner && active && balance > 0 && (
          <Button variant="secondary" className="full" loading={busy === "rb"} onClick={() => run("rb", async () => { const { error } = await supabase.rpc("request_balance", { p_order: o.id }); if (error) throw error; toast("Balance request sent", "success"); })}>Request balance from client</Button>
        )}
        {payments.length > 0 && <div className="payment-list">{payments.map((p) => (
          <div key={p.id}><span>{p.kind} · {shortDate(p.paid_at ?? p.created_at)}</span><b>{money(p.amount_minor, p.currency)}</b><small className={p.status}>{p.status}</small></div>
        ))}</div>}
      </section>

      {isDesigner && (
        <section className="card">
          <h3>Client details</h3>
          <p className="fine">{o.client?.full_name ?? "Client"} · {o.delivery_address.line1}{o.delivery_address.line2 ? `, ${o.delivery_address.line2}` : ""}, {o.delivery_address.city}{o.delivery_address.state ? `, ${o.delivery_address.state}` : ""}, {o.delivery_address.country}</p>
          {o.note && <p className="note-box">“{o.note}”</p>}
          <div className="measure-grid readonly">
            {MEASUREMENT_FIELDS.filter((f) => o.measurements_snapshot[f.key] != null).map((f) => <div key={f.key}><span>{f.label}</span><b>{o.measurements_snapshot[f.key]} cm</b></div>)}
          </div>
          {nextStatus && (
            <Button className="full" loading={busy === "adv"} onClick={() => (nextStatus === "shipped" ? setShip(true) : advance(nextStatus))}>{NEXT_LABEL[nextStatus]} <Icon name="arrow" size={16} /></Button>
          )}
        </section>
      )}

      <section className="card">
        <h3>Timeline</h3>
        <ol className="timeline">
          {events.map((e, i) => (
            <li key={e.id} className={i === events.length - 1 ? "now" : ""}>
              <span /><div><b>{statusLabel(e.status)}</b><small>{shortDate(e.created_at)}{e.note ? ` · ${e.note}` : ""}</small></div>
            </li>
          ))}
          {isClient && STAGES.filter((s) => STAGES.indexOf(s) > STAGES.indexOf(o.status as (typeof STAGES)[number])).map((s) => <li key={s} className="todo"><span /><div><b>{statusLabel(s)}</b></div></li>)}
        </ol>
      </section>

      {ship && (
        <Sheet onClose={() => setShip(false)} label="Shipping details">
          <div className="sheet-pad">
            <h2>Shipping details</h2>
            <label className="field"><span>Carrier</span><input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. DHL, GIG Logistics" /></label>
            <label className="field"><span>Tracking number</span><input value={trackNo} onChange={(e) => setTrackNo(e.target.value)} /></label>
            <Button className="full" disabled={!carrier.trim() || !trackNo.trim()} loading={busy === "adv"} onClick={() => advance("shipped", { carrier: carrier.trim(), number: trackNo.trim() })}>Mark as shipped</Button>
          </div>
        </Sheet>
      )}
      <button className="link center" onClick={() => nav(-1)}>Back</button>
    </>
  );
}
