import { useEffect, useState } from "react";
import { supabase, fn, when, errMsg } from "../lib";

interface A { id: string; title: string; body: string | null; image_url: string | null; cta_label: string | null; cta_url: string | null; audience: string; placement: string; status: string; priority: number; starts_at: string; ends_at: string | null; impressions: number; clicks: number }
const blank = { id: "", title: "", body: "", image_url: "", cta_label: "", cta_url: "", audience: "all", placement: "home_banner", status: "draft", priority: "0", starts_at: "", ends_at: "" };
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function Ads() {
  const [list, setList] = useState<A[]>([]);
  const [f, setF] = useState(blank);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const load = async () => { const { data, error } = await supabase.from("ads").select("*").order("created_at", { ascending: false }); if (error) setErr(errMsg(error)); else setList((data ?? []) as A[]); };
  useEffect(() => { void load(); }, []);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));

  const upload = async (file: File) => {
    setBusy("img"); setErr("");
    try {
      const { data: me } = await supabase.auth.getUser();
      const path = `${me.user!.id}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
      const { error } = await supabase.storage.from("ad-creatives").upload(path, file, { contentType: file.type });
      if (error) throw error;
      set("image_url", supabase.storage.from("ad-creatives").getPublicUrl(path).data.publicUrl);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const draft = async () => {
    setBusy("ai"); setErr("");
    try { const r = await fn<{ title: string; body: string; cta_label: string }>("ai-copy", { mode: "advert", brief, audience: f.audience }); setF((x) => ({ ...x, title: r.title, body: r.body, cta_label: r.cta_label })); } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const save = async () => {
    setErr("");
    if (!f.title.trim()) return setErr("Title is required");
    if (f.cta_url && !/^(https:\/\/|tailorit:\/\/)/.test(f.cta_url)) return setErr("Link must start with https:// or tailorit://");
    setBusy("save");
    const row = { title: f.title.trim(), body: f.body || null, image_url: f.image_url || null, cta_label: f.cta_label || null, cta_url: f.cta_url || null, audience: f.audience, placement: f.placement, status: f.status, priority: parseInt(f.priority) || 0, starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : new Date().toISOString(), ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null };
    const { error } = f.id ? await supabase.from("ads").update(row).eq("id", f.id) : await supabase.from("ads").insert(row);
    setBusy("");
    if (error) return setErr(errMsg(error));
    setF(blank); void load();
  };
  const edit = (a: A) => { setF({ id: a.id, title: a.title, body: a.body ?? "", image_url: a.image_url ?? "", cta_label: a.cta_label ?? "", cta_url: a.cta_url ?? "", audience: a.audience, placement: a.placement, status: a.status, priority: String(a.priority), starts_at: local(a.starts_at), ends_at: local(a.ends_at) }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const setStatus = async (a: A, status: string) => { await supabase.from("ads").update({ status }).eq("id", a.id); void load(); };
  const remove = async (a: A) => { if (window.confirm(`Delete "${a.title}" and its stats?`)) { await supabase.from("ads").delete().eq("id", a.id); void load(); } };

  return (
    <>
      <h1>Adverts</h1><p className="sub">Banners, feed cards and full-screen messages shown inside the app</p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{f.id ? "Edit advert" : "New advert"}</h3>
        <div className="row" style={{ alignItems: "flex-end" }}><label style={{ flex: 3 }}>Brief for AI draft (optional)<input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Promote made-to-measure wedding guest outfits" /></label><button className="btn" style={{ flex: 1 }} onClick={draft} disabled={busy === "ai" || !brief.trim()}>{busy === "ai" ? "Drafting…" : "✦ Draft with AI"}</button></div>
        <div className="row"><label>Audience<select value={f.audience} onChange={(e) => set("audience", e.target.value)}><option value="all">Everyone</option><option value="clients">Clients</option><option value="designers">Designers</option></select></label>
          <label>Placement<select value={f.placement} onChange={(e) => set("placement", e.target.value)}><option value="home_banner">Home banner</option><option value="feed_card">Feed card</option><option value="designer_home">Designer studio</option><option value="interstitial">Full-screen (once a day)</option></select></label>
          <label>Status<select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label></div>
        <label>Headline<input maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label>Body<textarea value={f.body} onChange={(e) => set("body", e.target.value)} /></label>
        <div className="row"><label>Button label<input maxLength={20} value={f.cta_label} onChange={(e) => set("cta_label", e.target.value)} /></label><label>Button link<input value={f.cta_url} onChange={(e) => set("cta_url", e.target.value)} placeholder="https://… or tailorit://wardrobe" /></label></div>
        <div className="row"><label>Starts<input type="datetime-local" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></label><label>Ends (optional)<input type="datetime-local" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></label><label>Priority<input type="number" value={f.priority} onChange={(e) => set("priority", e.target.value)} /></label></div>
        <label>Image (JPG/PNG/WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /></label>
        {f.image_url && <div className="preview"><img src={f.image_url} alt="" /></div>}
        {err && <p className="err">{err}</p>}
        <button className="btn primary" style={{ marginTop: 14 }} onClick={save} disabled={busy === "save" || busy === "img"}>{busy === "save" ? "Saving…" : f.id ? "Save changes" : "Create advert"}</button>{f.id && <button className="btn" style={{ marginLeft: 8 }} onClick={() => setF(blank)}>Cancel</button>}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><table><thead><tr><th>Advert</th><th>Where</th><th>Status</th><th>Schedule</th><th>Views</th><th>Clicks</th><th>CTR</th><th /></tr></thead>
        <tbody>{list.map((a) => <tr key={a.id}><td>{a.title}</td><td>{a.audience} · {a.placement}</td><td><span className={`tag ${a.status === "active" ? "ok" : ""}`}>{a.status}</span></td><td>{when(a.starts_at)}{a.ends_at && <><br />→ {when(a.ends_at)}</>}</td><td>{a.impressions}</td><td>{a.clicks}</td><td>{a.impressions ? ((a.clicks / a.impressions) * 100).toFixed(1) + "%" : "—"}</td>
          <td style={{ whiteSpace: "nowrap" }}><button className="btn sm" onClick={() => edit(a)}>Edit</button> <button className="btn sm" onClick={() => void setStatus(a, a.status === "active" ? "paused" : "active")}>{a.status === "active" ? "Pause" : "Activate"}</button> <button className="btn sm danger" onClick={() => void remove(a)}>Delete</button></td></tr>)}</tbody></table></div>
    </>
  );
}
