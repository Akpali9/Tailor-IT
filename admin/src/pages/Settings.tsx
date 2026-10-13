import { useEffect, useState } from "react";
import { supabase, when, errMsg } from "../lib";

interface Log { id: number; action: string; entity: string | null; entity_id: string | null; details: unknown; created_at: string }

export default function Settings() {
  const [s, setS] = useState<Record<string, unknown>>({});
  const [log, setLog] = useState<Log[]>([]);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const load = async () => {
    const [a, b] = await Promise.all([supabase.from("platform_settings").select("key,value"), supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(50)]);
    setS(Object.fromEntries(((a.data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]))); setLog((b.data ?? []) as Log[]);
  };
  useEffect(() => { void load(); }, []);
  const save = async (key: string, value: unknown) => {
    setErr(""); setMsg("");
    const { error } = await supabase.rpc("admin_update_setting", { p_key: key, p_value: value });
    if (error) setErr(errMsg(error)); else { setMsg(`Saved ${key}`); void load(); }
  };
  const num = (key: string, label: string, hint: string) => (
    <label>{label}<input type="number" value={String(s[key] ?? "")} onChange={(e) => setS({ ...s, [key]: e.target.value })} onBlur={(e) => e.target.value && void save(key, Number(e.target.value))} /><small style={{ color: "var(--muted)" }}>{hint}</small></label>
  );
  const txt = (key: string, label: string) => <label>{label}<input value={String(s[key] ?? "")} onChange={(e) => setS({ ...s, [key]: e.target.value })} onBlur={(e) => void save(key, e.target.value)} /></label>;
  return (
    <>
      <h1>Settings</h1><p className="sub">Changes apply to new orders immediately. Every change is audit-logged.</p>
      {err && <p className="err">{err}</p>}{msg && <p className="okmsg">{msg}</p>}
      <div className="card">
        <div className="row">{num("fee_bps", "Platform fee (basis points)", "1000 = 10%. Must cover payment-processing costs.")}{num("deposit_percent", "Deposit percentage", "Shown to clients choosing a deposit plan (10–90).")}</div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", margin: 0 }} checked={s.require_designer_verification === true} onChange={(e) => void save("require_designer_verification", e.target.checked)} /> Require admin verification before designers can publish pieces</label>
        <div className="row">{txt("support_email", "Support email")}{txt("min_app_version", "Minimum app version")}</div>
        <div className="row">{txt("terms_url", "Terms URL")}{txt("privacy_url", "Privacy URL")}</div>
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><h3 style={{ margin: 16 }}>Audit log</h3><table><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>{log.map((l) => <tr key={l.id}><td>{when(l.created_at)}</td><td>{l.action}</td><td>{l.entity} {l.entity_id}</td><td><code style={{ fontSize: 11.5 }}>{JSON.stringify(l.details)}</code></td></tr>)}</tbody></table></div>
    </>
  );
}
