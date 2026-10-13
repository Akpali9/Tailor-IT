import { useCallback, useEffect, useState } from "react";
import { supabase, when, errMsg } from "../lib";

interface U { id: string; email: string; full_name: string; handle: string; role: "client" | "designer"; status: "active" | "suspended"; verified: boolean; created_at: string; last_sign_in_at: string | null; orders: number }

export default function Users() {
  const [rows, setRows] = useState<U[]>([]);
  const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_list_users", { p_search: q || null, p_role: role || null, p_limit: 100, p_offset: 0 });
    if (error) setErr(errMsg(error)); else { setErr(""); setRows(data as U[]); }
  }, [q, role]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) setErr(error.message); else void load(); };
  return (
    <>
      <h1>Users</h1><p className="sub">Clients and designers</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Search name, email or handle" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="client">Clients</option><option value="designer">Designers</option></select>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Orders</th><th>Joined</th><th>Last seen</th><th /></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}><td>{u.full_name}<br /><small style={{ color: "var(--muted)" }}>@{u.handle}</small></td><td>{u.email}</td>
            <td>{u.role}{u.role === "designer" && <span className={`tag ${u.verified ? "ok" : "warn"}`} style={{ marginLeft: 6 }}>{u.verified ? "verified" : "unverified"}</span>}</td>
            <td><span className={`tag ${u.status === "active" ? "ok" : "bad"}`}>{u.status}</span></td><td>{u.orders}</td><td>{when(u.created_at)}</td><td>{when(u.last_sign_in_at)}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {u.role === "designer" && <button className="btn sm" onClick={() => act(supabase.rpc("admin_set_designer_verified", { p_user: u.id, p_verified: !u.verified }))}>{u.verified ? "Unverify" : "Verify"}</button>}{" "}
              <button className={`btn sm ${u.status === "active" ? "danger" : ""}`} onClick={() => { if (u.status !== "active" || window.confirm(`Suspend ${u.full_name}? Their live pieces will be unpublished.`)) void act(supabase.rpc("admin_set_user_status", { p_user: u.id, p_status: u.status === "active" ? "suspended" : "active" })); }}>{u.status === "active" ? "Suspend" : "Reinstate"}</button>
            </td></tr>))}</tbody></table></div>
    </>
  );
}
