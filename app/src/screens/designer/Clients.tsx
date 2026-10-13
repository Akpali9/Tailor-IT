import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Empty, Header, Loading, StatusPill } from "@/components/ui";
import Icon from "@/components/Icon";
import { useAuth } from "@/state/Auth";
import { useOrders } from "@/lib/queries";
import { money } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function Clients() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data, isLoading } = useOrders();
  const [q, setQ] = useState("");
  const clients = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null; orders: Order[] }>();
    for (const o of (data ?? []).filter((x) => x.designer_id === profile?.id && x.client_id)) {
      const c = map.get(o.client_id!) ?? { name: o.client?.full_name ?? "Client", avatar: o.client?.avatar_url ?? null, orders: [] };
      c.orders.push(o); map.set(o.client_id!, c);
    }
    return [...map.entries()].map(([id, c]) => ({ id, ...c })).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  }, [data, profile?.id, q]);
  return (
    <>
      <Header title="Clients" subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"} with paid orders`} />
      <div className="search-box"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></div>
      {isLoading ? <Loading /> : clients.length === 0 ? <Empty icon="people" title="No clients yet" text="Clients appear here once they've paid for an order." />
        : clients.map((c) => {
          const latest = c.orders[0];
          const spent = c.orders.reduce((s, o) => s + o.amount_paid_minor, 0);
          return (
            <article className="designer-row" key={c.id} role="button" tabIndex={0} onClick={() => nav(`/orders/${latest.id}`)}>
              <Avatar name={c.name} src={c.avatar} />
              <div><h3>{c.name}</h3><p>{c.orders.length} order{c.orders.length === 1 ? "" : "s"} · {money(spent, latest.currency)}</p></div>
              <StatusPill status={latest.status} /><Icon name="chevron" />
            </article>
          );
        })}
    </>
  );
}
