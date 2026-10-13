import { useNavigate } from "react-router-dom";
import { Avatar, Button, Header, Skeleton, StatusPill } from "@/components/ui";
import Icon from "@/components/Icon";
import { AdSlot } from "@/components/AdSlot";
import { useAuth } from "@/state/Auth";
import { useDesignerStats, useOrders } from "@/lib/queries";
import { money, orderNo } from "@/lib/format";

export default function Studio() {
  const nav = useNavigate();
  const { profile, designer } = useAuth();
  const stats = useDesignerStats();
  const orders = useOrders();
  const mine = (orders.data ?? []).filter((o) => o.designer_id === profile?.id);
  const attention = mine.filter((o) => ["paid", "fitting_review"].includes(o.status)).slice(0, 4);
  const s = stats.data;
  return (
    <>
      <Header title={`Hello, ${profile?.full_name.split(" ")[0] ?? ""}.`} subtitle="Your atelier at a glance" />
      {!designer?.accepting_orders && (
        <section className="callout warn">
          <b>Set up payouts to start selling</b>
          <p>Clients can't order from you until you've connected where to receive your money.</p>
          <Button onClick={() => nav("/payouts")}>Set up payouts <Icon name="arrow" size={15} /></Button>
        </section>
      )}
      <section className="studio-hero">
        <span>THIS WEEK</span>
        {stats.isLoading ? <Skeleton h={60} /> : <><strong>{s?.active_orders ?? 0}</strong><h2>active orders</h2>
          <p>{s?.awaiting_review ? `${s.awaiting_review} awaiting your fitting review.` : "You're all caught up."}</p></>}
        <Button onClick={() => nav("/production")}>Open production queue <Icon name="arrow" /></Button>
      </section>
      <div className="metric-grid">
        <article><Icon name="hanger" /><strong>{s?.live_products ?? 0}</strong><span>Live pieces</span></article>
        <article><Icon name="sparkle" /><strong>{s?.tryons ?? 0}</strong><span>Virtual try-ons</span></article>
        <article><Icon name="check" /><strong>{s?.delivered ?? 0}</strong><span>Delivered</span></article>
        <article onClick={() => nav("/payouts")} role="button" tabIndex={0}><Icon name="card" /><strong>{s?.earnings?.[0] ? money(s.earnings[0].net_minor, s.earnings[0].currency) : "—"}</strong><span>Net earnings</span></article>
      </div>
      <AdSlot placement="designer_home" />
      <div className="section-title"><div><span>NEEDS ATTENTION</span><h2>Recent client orders</h2></div><button onClick={() => nav("/production")}>View all</button></div>
      {attention.length === 0 ? <p className="fine pad">Nothing needs your attention right now.</p> : attention.map((o) => (
        <article className="designer-row" key={o.id} role="button" tabIndex={0} onClick={() => nav(`/orders/${o.id}`)}>
          <Avatar name={o.client?.full_name ?? "Client"} src={o.client?.avatar_url} />
          <div><h3>{o.client?.full_name ?? "Client"}</h3><p>{o.product_snapshot.name} · {orderNo(o.number)}</p></div>
          <StatusPill status={o.status} /><Icon name="chevron" />
        </article>
      ))}
    </>
  );
}
