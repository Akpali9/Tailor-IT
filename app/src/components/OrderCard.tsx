import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { StatusPill } from "./ui";
import { money, orderNo } from "@/lib/format";
import type { Order } from "@/lib/types";

export const STAGES = ["paid", "cutting", "assembly", "fitting_review", "finishing", "shipped", "delivered"] as const;
export const progress = (o: Order) => {
  const i = STAGES.indexOf(o.status as (typeof STAGES)[number]);
  return i < 0 ? 0 : Math.round(((i + 1) / STAGES.length) * 100);
};

export default function OrderCard({ order, subtitle }: { order: Order; subtitle: string }) {
  const nav = useNavigate();
  return (
    <article className="client-order" role="button" tabIndex={0} onClick={() => nav(`/orders/${order.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/orders/${order.id}`)}>
      {order.product_snapshot.image ? <img src={order.product_snapshot.image} alt="" loading="lazy" /> : <span className="img-ph" />}
      <div>
        <span>ORDER {orderNo(order.number)}</span>
        <h3>{order.product_snapshot.name}</h3>
        <p>{subtitle}</p>
        <div className="order-progress"><i style={{ width: `${progress(order)}%` }} /></div>
        <div className="row-between"><StatusPill status={order.status} /><small>{money(order.amount_paid_minor, order.currency)} / {money(order.amount_minor, order.currency)}</small></div>
      </div>
      <Icon name="chevron" />
    </article>
  );
}
