import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { waitForPayment } from "@/lib/pay";
import { supabase } from "@/lib/supabase";
import { Button, Spinner } from "@/components/ui";
import Icon from "@/components/Icon";

export default function PayReturn() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const reference = params.get("reference") ?? "";
  const cancelled = params.get("status") === "cancelled";
  const [state, setState] = useState<"checking" | "succeeded" | "failed" | "pending">(cancelled ? "failed" : "checking");
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) { nav("/orders", { replace: true }); return; }
    void supabase.from("payments").select("order_id").eq("reference", reference).maybeSingle().then(({ data }) => setOrderId(data?.order_id ?? null));
    if (cancelled) return;
    let live = true;
    void waitForPayment(reference).then((s) => { if (live) { setState(s); void qc.invalidateQueries({ queryKey: ["orders"] }); void qc.invalidateQueries({ queryKey: ["order"] }); } });
    return () => { live = false; };
  }, [reference, cancelled, nav, qc]);

  const go = () => nav(orderId ? `/orders/${orderId}` : "/orders", { replace: true });
  return (
    <div className="pay-return">
      {state === "checking" && <><Spinner /><h2>Confirming your payment…</h2><p>This usually takes a few seconds. Please don't close the app.</p></>}
      {state === "succeeded" && <><span className="big-icon ok"><Icon name="check" size={34} /></span><h2>Payment received</h2><p>Your tailor has been notified and will start on your piece.</p><Button onClick={go}>View my order</Button></>}
      {state === "failed" && <><span className="big-icon bad"><Icon name="x" size={34} /></span><h2>{cancelled ? "Payment cancelled" : "Payment didn't go through"}</h2><p>You haven't been charged. You can try again from your order.</p><Button onClick={go}>Back to my order</Button></>}
      {state === "pending" && <><span className="big-icon warn"><Icon name="info" size={34} /></span><h2>Still processing</h2><p>Your bank is taking a little longer. We'll notify you the moment it's confirmed — no need to pay again.</p><Button onClick={go}>View my order</Button></>}
    </div>
  );
}
