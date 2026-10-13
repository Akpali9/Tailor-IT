import { useEffect, useState } from "react";
import { supabase, fn, money, when, errMsg } from "../lib";

interface O { id: string; number: number; status: string; currency: string; amount_minor: number; amount_paid_minor: number; fee_minor: number; created_at: string; product_snapshot: { name: string }; client: { full_name: string } | null; designer: { full_name: string } | null }
interface P { id: string; reference: string; kind: string; amount_minor: number; refunded_minor: number; currency: string; status: string; provider: string; created_at: string }

export default function Orders() {
  const [rows, setRows] = useState<O[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [pays, setPays] = useState<P[]>([]);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const load = async () => {
    const { data, error } = await supabase.from("orders").select("id,number,status,currency,amount_minor,amount_paid_minor,fee_minor,created_at,product_snapshot,client:profiles!client_id(full_name),designer:profiles!designer_id(full_name)").order("created_at", { ascending: false }).limit(100);
    if (error) setErr(errMsg(error)); else setRows(data as unknown as O[]);
  };
  useEffect(() => { void load(); }, []);
  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id); setPays([]);
    const { data } = await supabase.from("payments").select("*").eq("order_id", id).order("created_at");
    setPays((data ?? []) as P[]);
  };
  const refund = async (p: P) => {
    const left = p.amount_minor - p.refunded_minor;
    const input = window.prompt(`Refund amount in ${p.currency} (max ${(left / 100).toFixed(2)}). Leave blank for the full remaining amount.`, "");
    if (input === null) return;
    const minor = input.trim() === "" ? left : Math.round(parseFloat(input) * 100);
    if (!(minor > 0 && minor <= left)) return setErr("Invalid amount");
    if (!window.confirm(`Refund ${money(minor, p.currency)} on ${p.reference}? This cannot be undone.`)) return;
    setErr(""); setMsg("");
    try { await fn("admin-refund", { payment_id: p.id, amount_minor: minor, reason: "Admin refund" }); setMsg("Refund issued"); await load(); await toggle(open!); await toggle(open!); } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <>
      <h1>Orders & payments</h1><p className="sub">Most recent 100 orders</p>
      {err && <p className="err">{err}</p>}{msg && <p className="okmsg">{msg}</p>}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><table>
        <thead><tr><th>Order</th><th>Piece</th><th>Client</th><th>Designer</th><th>Status</th><th>Paid / Total</th><th>Created</th></tr></thead>
        <tbody>{rows.flatMap((o) => [
          <tr key={o.id} onClick={() => void toggle(o.id)} style={{ cursor: "pointer" }}><td>TI-{o.number}</td><td>{o.product_snapshot?.name}</td><td>{o.client?.full_name ?? "—"}</td><td>{o.designer?.full_name ?? "—"}</td><td><span className="tag">{o.status}</span></td><td>{money(o.amount_paid_minor, o.currency)} / {money(o.amount_minor, o.currency)}</td><td>{when(o.created_at)}</td></tr>,
          open === o.id && <tr key={o.id + "p"}><td colSpan={7} style={{ background: "var(--panel2)" }}>
            {pays.length === 0 ? "No payments" : <table>{pays.map((p) => <tr key={p.id}><td>{p.reference}</td><td>{p.provider}</td><td>{p.kind}</td><td>{money(p.amount_minor, p.currency)}{p.refunded_minor > 0 && ` (refunded ${money(p.refunded_minor, p.currency)})`}</td><td><span className={`tag ${p.status === "succeeded" ? "ok" : p.status === "failed" ? "bad" : ""}`}>{p.status}</span></td><td>{(p.status === "succeeded" || p.status === "refunded") && p.amount_minor > p.refunded_minor && <button className="btn sm danger" onClick={() => void refund(p)}>Refund…</button>}</td></tr>)}</table>}
          </td></tr>])}</tbody></table></div>
    </>
  );
}
