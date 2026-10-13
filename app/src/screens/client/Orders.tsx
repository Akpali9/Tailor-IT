import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, ErrorState, Header, Skeleton } from "@/components/ui";
import OrderCard from "@/components/OrderCard";
import { useDesigners, useOrders, brandOf } from "@/lib/queries";
import { useAuth } from "@/state/Auth";

export default function Orders() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const orders = useOrders();
  const designers = useDesigners();
  const [tab, setTab] = useState<"active" | "past">("active");
  const mine = (orders.data ?? []).filter((o) => o.client_id === profile?.id);
  const done = (s: string) => ["delivered", "cancelled", "refunded"].includes(s);
  const list = mine.filter((o) => (tab === "past" ? done(o.status) : !done(o.status)));
  return (
    <>
      <Header title="Orders" subtitle="Follow every stitch from studio to you" />
      <div className="tabs" role="tablist">
        {(["active", "past"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "active" ? "Active" : "Past"}</button>)}
      </div>
      {orders.isError ? <ErrorState onRetry={() => orders.refetch()} />
        : orders.isLoading ? <><Skeleton h={120} /><Skeleton h={120} /></>
        : list.length === 0 ? <Empty icon="bag" title={tab === "active" ? "No active orders" : "No past orders"} text={tab === "active" ? "Find a piece you love and have it made for you." : "Delivered and cancelled orders appear here."} action={tab === "active" ? <Button onClick={() => nav("/wardrobe")}>Browse the wardrobe</Button> : undefined} />
        : list.map((o) => <OrderCard key={o.id} order={o} subtitle={`by ${o.product_snapshot.brand ?? brandOf(designers.data, o.designer_id ?? "")}`} />)}
    </>
  );
}
