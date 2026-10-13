import { useEffect, useState } from "react";
import { supabase, money, errMsg } from "../lib";

interface Stats { clients: number; designers: number; verified_designers: number; live_products: number; orders_total: number; orders_active: number; tryons_30d: number;
  revenue: { currency: string; gmv_minor: number; fees_minor: number; refunded_minor: number }[]; daily: { day: string; signups: number; orders: number }[] }

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { supabase.rpc("admin_stats").then(({ data, error }) => (error ? setErr(errMsg(error)) : setS(data as Stats))); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!s) return <p className="sub">Loading…</p>;
  const max = Math.max(1, ...s.daily.map((d) => Math.max(d.signups, d.orders)));
  const stat = (label: string, v: number | string) => <div className="card stat"><span>{label}</span><b>{v}</b></div>;
  return (
    <>
      <h1>Overview</h1><p className="sub">Live platform health</p>
      <div className="grid">
        {stat("Clients", s.clients)}{stat("Designers", `${s.designers} (${s.verified_designers} verified)`)}{stat("Live pieces", s.live_products)}
        {stat("Orders", s.orders_total)}{stat("In progress", s.orders_active)}{stat("Try-ons (30d)", s.tryons_30d)}
      </div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Revenue</h3>
        {s.revenue.length === 0 ? <p className="sub">No payments yet.</p> : <table><thead><tr><th>Currency</th><th>Gross volume</th><th>Platform fees</th><th>Refunded</th></tr></thead>
          <tbody>{s.revenue.map((r) => <tr key={r.currency}><td>{r.currency}</td><td>{money(r.gmv_minor, r.currency)}</td><td>{money(r.fees_minor, r.currency)}</td><td>{money(r.refunded_minor, r.currency)}</td></tr>)}</tbody></table>}
      </div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Last 30 days <small style={{ color: "var(--muted)", fontWeight: 400 }}>— purple: sign-ups · green: orders</small></h3>
        <div className="bars">{s.daily.map((d) => <span key={d.day} style={{ display: "contents" }}><i title={`${d.day}: ${d.signups} sign-ups`} style={{ height: `${(d.signups / max) * 100}%` }} /><i className="o" title={`${d.day}: ${d.orders} orders`} style={{ height: `${(d.orders / max) * 100}%` }} /></span>)}</div>
      </div>
    </>
  );
}
