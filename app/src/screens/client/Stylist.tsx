import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Header, Loading } from "@/components/ui";
import Icon from "@/components/Icon";
import ConsentSheet from "@/components/ConsentSheet";
import ProductSheet from "@/components/ProductSheet";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { useProducts, useStylistHistory } from "@/lib/queries";
import { api } from "@/lib/api";
import { friendly } from "@/lib/errors";
import { money } from "@/lib/format";
import type { Product, StylistMessage } from "@/lib/types";

const SUGGESTIONS = ["Wedding guest outfit", "Smart office look", "Date-night dress", "Something for a gala"];

export default function Stylist() {
  const { priv } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: history, isLoading } = useStylistHistory();
  const { data: products } = useProducts();
  const [local, setLocal] = useState<StylistMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);
  const [consent, setConsent] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const all = [...(history ?? []), ...local];
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [all.length, busy]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setText(""); setBusy(true);
    const now = new Date().toISOString();
    setLocal((l) => [...l, { id: -Date.now(), role: "user", content: m, product_ids: [], created_at: now }]);
    try {
      const r = await api.stylist(m);
      setLocal((l) => [...l, { id: -Date.now() - 1, role: "assistant", content: r.reply, product_ids: r.product_ids, created_at: new Date().toISOString() }]);
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(false); void qc.invalidateQueries({ queryKey: ["stylist"] }); }
  };

  if (isLoading) return <><Header title="AI Stylist" back /><Loading /></>;
  return (
    <div className="chat-screen">
      <Header title="AI Stylist" subtitle="Advice for your occasion, taste and fit" back />
      <div className="chat-scroll">
        {all.length === 0 && (
          <div className="chat-intro">
            <span className="big-icon plum"><Icon name="sparkle" size={28} /></span>
            <h2>Tell me what you're dressing for.</h2>
            <p>I'll suggest pieces from our designers and explain why they'll suit you.</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} onClick={() => (priv?.ai_consent_at ? void send(s) : setConsent(true))}>{s}</button>)}</div>
          </div>
        )}
        {all.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <p>{m.content}</p>
            {m.product_ids.length > 0 && (
              <div className="rec-row">
                {m.product_ids.map((id) => products?.find((p) => p.id === id)).filter((p): p is Product => !!p).map((p) => (
                  <button key={p.id} className="rec" onClick={() => setOpen(p)}><img src={p.image_urls[0]} alt="" /><span><b>{p.name}</b><small>{money(p.price_minor, p.currency)}</small></span></button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant typing" aria-label="Stylist is typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); if (!priv?.ai_consent_at) return setConsent(true); void send(text); }}>
        <input value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="e.g. Garden wedding in June, I love earthy tones" aria-label="Message your stylist" />
        <button type="submit" aria-label="Send" disabled={!text.trim() || busy}><Icon name="send" size={18} /></button>
      </form>
      {open && <ProductSheet product={open} onClose={() => setOpen(null)} />}
      {consent && <ConsentSheet onClose={() => setConsent(false)} onAccepted={() => setConsent(false)} />}
    </div>
  );
}
