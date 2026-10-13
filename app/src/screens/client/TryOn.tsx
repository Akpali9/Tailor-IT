import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Header, Sheet } from "@/components/ui";
import Icon from "@/components/Icon";
import ConsentSheet from "@/components/ConsentSheet";
import ProductSheet from "@/components/ProductSheet";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { useProducts } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { friendly } from "@/lib/errors";
import { pickPhoto } from "@/lib/native";
import { resizeImage } from "@/lib/image";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";

type Stage = "ready" | "uploading" | "generating" | "done";
const STEPS = ["Reading your silhouette…", "Draping the fabric…", "Matching proportions…", "Refining the details…"];

export default function TryOn() {
  const nav = useNavigate();
  const toast = useToast();
  const { session, priv } = useAuth();
  const { data: products } = useProducts();
  const intent = (useLocation().state as { intent?: string } | null)?.intent;
  const [selected, setSelected] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("ready");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [consent, setConsent] = useState<null | (() => void)>(null);
  const [estimateOpen, setEstimateOpen] = useState(intent === "estimate");
  const [height, setHeight] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [order, setOrder] = useState<Product | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { if (stage !== "generating") return; const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2500); return () => clearInterval(t); }, [stage]);

  const product = useMemo(() => products?.find((p) => p.id === selected) ?? products?.[0] ?? null, [products, selected]);

  const choose = async () => {
    const blob = await pickPhoto();
    if (!blob) return;
    try {
      const small = await resizeImage(blob);
      setPhoto({ url: URL.createObjectURL(small), blob: small });
      setPath(null); setResult(null); setStage("ready");
    } catch { toast("We couldn't read that photo. Try another.", "error"); }
  };

  const withConsent = (action: () => void) => (priv?.ai_consent_at ? action() : setConsent(() => action));

  const upload = async (): Promise<string> => {
    if (path) return path;
    const p = `${session!.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("tryon-inputs").upload(p, photo!.blob, { contentType: "image/jpeg" });
    if (error) throw error;
    setPath(p);
    return p;
  };

  const generate = async () => {
    if (!photo || !product) return;
    try {
      setStage("uploading");
      const p = await upload();
      setStage("generating"); setStep(0);
      const { id } = await api.tryonCreate(product.id, p);
      for (let i = 0; i < 40 && alive.current; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await api.tryonStatus(id);
        if (s.status === "completed" && s.url) { setResult(s.url); setShowOriginal(false); setStage("done"); return; }
        if (s.status === "failed") throw new Error(s.error ?? "failed");
      }
      throw new Error("tryon_timeout");
    } catch (e) {
      if (!alive.current) return;
      setStage("ready");
      toast(e instanceof Error && e.message === "tryon_timeout" ? "That's taking longer than usual. Please try again." : friendly(e) === "Something went wrong. Please try again." && e instanceof Error && e.message ? e.message : friendly(e), "error");
    }
  };

  const estimate = async () => {
    const h = parseFloat(height);
    if (!(h >= 90 && h <= 230)) return toast("Enter your height in cm (90–230).", "error");
    setEstimating(true);
    try {
      const p = await upload();
      const r = await api.measureEstimate(p, h);
      nav("/fit", { state: { proposed: r } });
    } catch (e) { toast(friendly(e), "error"); } finally { setEstimating(false); }
  };

  const shown = stage === "done" && result ? (showOriginal ? photo?.url : result) : photo?.url ?? product?.image_urls[0];
  return (
    <>
      <Header title="Virtual atelier" subtitle="Your private AI fitting room" />
      <section className="try-canvas" aria-live="polite">
        {shown ? <img src={shown} alt={stage === "done" ? "Virtual try-on result" : "Preview"} className={!photo ? "softened" : ""} /> : <div className="canvas-empty" />}
        {!photo && <div className="empty-preview"><span><Icon name="camera" /></span><h2>Add your photo</h2><p>Use a clear, full-length photo in natural light, facing the camera.</p><Button onClick={choose}>Choose photo</Button></div>}
        {photo && stage === "ready" && <div className="scan-tag">PHOTO READY</div>}
        {(stage === "uploading" || stage === "generating") && <div className="ai-loading"><i /><h2>{stage === "uploading" ? "Uploading securely…" : "Crafting your look"}</h2><p>{stage === "generating" ? STEPS[step] : "Encrypting and sending your photo"}</p></div>}
        {stage === "done" && <div className="ai-badge"><Icon name="sparkle" size={14} /> AI PREVIEW</div>}
        {stage === "done" && photo && <div className="compare"><button className={!showOriginal ? "active" : ""} onClick={() => setShowOriginal(false)}>Try-on</button><button className={showOriginal ? "active" : ""} onClick={() => setShowOriginal(true)}>Original</button></div>}
      </section>

      <div className="look-selector">
        <div className="section-title compact"><div><span>SELECT A PIECE</span><h2>Choose your look</h2></div>{photo && <button onClick={choose}>Change photo</button>}</div>
        <div className="look-row">
          {(products ?? []).map((p) => (
            <button key={p.id} className={product?.id === p.id ? "active" : ""} aria-pressed={product?.id === p.id} onClick={() => { setSelected(p.id); if (stage === "done") setStage("ready"); }}>
              <img src={p.image_urls[0]} alt="" loading="lazy" /><span>{p.name}</span>{product?.id === p.id && <i><Icon name="check" size={11} /></i>}
            </button>
          ))}
        </div>
      </div>

      <section className="ai-controls">
        <div><span>AI fit intelligence</span><b>{photo ? "Photo ready" : "Waiting for your photo"}</b></div>
        <p><Icon name="lock" size={13} /> Private by default. Photos are deleted automatically after 7 days.</p>
      </section>

      {stage !== "done"
        ? <Button className="full" disabled={!photo || !product || stage !== "ready"} loading={stage !== "ready"} onClick={() => withConsent(generate)}><Icon name="sparkle" size={18} /> Generate AI try-on</Button>
        : <><Button className="full" onClick={() => product && setOrder(product)}><Icon name="bag" size={18} /> Order made-to-measure · {product && money(product.price_minor, product.currency)}</Button>
            <Button variant="secondary" className="full" onClick={() => { setStage("ready"); setResult(null); }}>Try another piece</Button></>}
      <Button variant="ghost" className="full" disabled={!photo} onClick={() => setEstimateOpen(true)}><Icon name="ruler" size={17} /> Estimate my measurements from this photo</Button>

      {estimateOpen && (
        <Sheet onClose={() => setEstimateOpen(false)} label="Estimate measurements">
          <div className="sheet-pad">
            <h2>Estimate measurements</h2>
            <p className="fine">AI estimates from a single photo are approximate. You'll review and adjust every value before anything is saved.</p>
            {!photo ? <Button className="full" onClick={choose}>Choose a full-length photo first</Button> : (
              <>
                <label className="field"><span>Your height (cm)</span><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 172" /></label>
                <Button className="full" loading={estimating} onClick={() => withConsent(estimate)}><Icon name="sparkle" size={17} /> Estimate</Button>
              </>
            )}
          </div>
        </Sheet>
      )}
      {consent && <ConsentSheet onClose={() => setConsent(null)} onAccepted={() => { const a = consent; setConsent(null); a(); }} />}
      {order && <ProductSheet product={order} onClose={() => setOrder(null)} />}
    </>
  );
}
