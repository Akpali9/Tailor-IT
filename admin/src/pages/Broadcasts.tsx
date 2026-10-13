import { useEffect, useState } from "react";
import { supabase, fn, when, errMsg } from "../lib";

interface B { id: string; audience: string; category: string; title: string; body: string; status: string; recipient_count: number; push_sent_count: number; sent_at: string | null; created_at: string }

export default function Broadcasts() {
  const [list, setList] = useState<B[]>([]);
  const [f, setF] = useState({ audience: "all", category: "announcement", title: "", body: "", link: "", push: true, target: "" });
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const load = async () => { const { data } = await supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(50); setList((data ?? []) as B[]); };
  useEffect(() => { void load(); }, []);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const draft = async () => {
    if (!brief.trim()) return;
    setBusy("ai"); setErr("");
    try { const r = await fn<{ title: string; body: string }>("ai-copy", { mode: "message", brief, audience: f.audience }); setF((x) => ({ ...x, title: r.title, body: r.body })); } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const send = async () => {
    setErr(""); setOk("");
    if (!f.title.trim() || !f.body.trim()) return setErr("Title and message are required");
    if (f.link && !/^(https:\/\/|tailorit:\/\/)/.test(f.link)) return setErr("Link must start with https:// or tailorit://");
    if (f.audience === "user" && !/^[0-9a-f-]{36}$/i.test(f.target)) return setErr("Enter the recipient's user ID (UUID) from the Users page");
    if (!window.confirm(`Send "${f.title}" to ${f.audience === "user" ? "1 user" : f.audience}${f.category === "promo" ? " (promo — only opted-in users)" : ""}? This cannot be recalled.`)) return;
    setBusy("send");
    try {
      const { data: me } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("broadcasts").insert({ created_by: me.user!.id, audience: f.audience, target_user: f.audience === "user" ? f.target : null, category: f.category, title: f.title.trim(), body: f.body.trim(), deep_link: f.link || null, send_push: f.push }).select("id").single();
      if (error) throw error;
      const r = await fn<{ recipients: number; push_sent: number }>("admin-broadcast", { broadcast_id: data.id });
      setOk(`Delivered to ${r.recipients} inbox(es); ${r.push_sent} push notification(s) sent.`);
      setF((x) => ({ ...x, title: "", body: "", link: "" })); await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  return (
    <>
      <h1>Messages</h1><p className="sub">Send in-app messages and push notifications to clients, designers or everyone</p>
      <div className="card">
        <div className="row">
          <label>Audience<select value={f.audience} onChange={(e) => set("audience", e.target.value)}><option value="all">Everyone</option><option value="clients">All clients</option><option value="designers">All designers</option><option value="user">One user</option></select></label>
          <label>Type<select value={f.category} onChange={(e) => set("category", e.target.value)}><option value="announcement">Announcement (service message)</option><option value="promo">Promotion (opted-in users only)</option></select></label>
        </div>
        {f.audience === "user" && <label>User ID<input value={f.target} onChange={(e) => set("target", e.target.value)} placeholder="uuid" /></label>}
        <div className="row" style={{ alignItems: "flex-end" }}><label style={{ flex: 3 }}>Brief for AI draft (optional)<input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Announce free fitting consultations this weekend" /></label><button className="btn" style={{ flex: 1 }} onClick={draft} disabled={busy === "ai"}>{busy === "ai" ? "Drafting…" : "✦ Draft with AI"}</button></div>
        <label>Title<input maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label>Message<textarea maxLength={1000} value={f.body} onChange={(e) => set("body", e.target.value)} /></label>
        <label>Link when tapped (optional)<input value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://… or tailorit://wardrobe" /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto", margin: 0 }} checked={f.push} onChange={(e) => set("push", e.target.checked)} /> Also send as push notification</label>
        <div className="preview"><small style={{ color: "var(--muted)" }}>Preview</small><br /><b>{f.title || "Title"}</b><br />{f.body || "Message body"}</div>
        {err && <p className="err">{err}</p>}{ok && <p className="okmsg">{ok}</p>}
        <button className="btn primary" style={{ marginTop: 14 }} onClick={send} disabled={busy === "send"}>{busy === "send" ? "Sending…" : "Send now"}</button>
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><table><thead><tr><th>Sent</th><th>Audience</th><th>Title</th><th>Inbox</th><th>Push</th></tr></thead>
        <tbody>{list.map((b) => <tr key={b.id}><td>{when(b.sent_at ?? b.created_at)}</td><td>{b.audience} · {b.category}</td><td>{b.title}</td><td>{b.recipient_count}</td><td>{b.push_sent_count}</td></tr>)}</tbody></table></div>
    </>
  );
}
