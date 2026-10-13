import { useNavigate } from "react-router-dom";
import { Avatar, Empty, Header, Loading } from "@/components/ui";
import Icon from "@/components/Icon";
import { useAuth } from "@/state/Auth";
import { useOrders } from "@/lib/queries";
import { orderNo, shortDate } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: "paid", label: "New · ready to cut" }, { status: "cutting", label: "Pattern & cutting" }, { status: "assembly", label: "Assembly" },
  { status: "fitting_review", label: "Fitting review" }, { status: "finishing", label: "Finishing" }, { status: "shipped", label: "Shipped" },
];

export default function Production() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data, isLoading } = useOrders();
  const mine = (data ?? []).filter((o) => o.designer_id === profile?.id);
  const total = mine.filter((o) => COLUMNS.some((c) => c.status === o.status)).length;
  return (
    <>
      <Header title="Production" subtitle={`${total} piece${total === 1 ? "" : "s"} in your atelier`} />
      {isLoading ? <Loading /> : total === 0 ? <Empty icon="chart" title="Nothing in production" text="Paid orders show up here so you can move them through your workshop." /> : COLUMNS.map((col, i) => {
        const items = mine.filter((o) => o.status === col.status);
        if (!items.length) return null;
        return (
          <section className="production-stage" key={col.status}>
            <div><span>0{i + 1}</span><h2>{col.label}</h2><b>{items.length}</b></div>
            {items.map((o) => (
              <article key={o.id} role="button" tabIndex={0} onClick={() => nav(`/orders/${o.id}`)}>
                <Avatar name={o.client?.full_name ?? "Client"} src={o.client?.avatar_url} size={38} />
                <p><strong>{o.product_snapshot.name}</strong><small>{o.client?.full_name ?? "Client"} · {orderNo(o.number)}{o.estimated_delivery ? ` · Due ${shortDate(o.estimated_delivery)}` : ""}</small></p>
                <Icon name="chevron" />
              </article>
            ))}
          </section>
        );
      })}
    </>
  );
}
