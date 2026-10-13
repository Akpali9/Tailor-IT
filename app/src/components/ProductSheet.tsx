import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Sheet } from "./ui";
import Icon from "./Icon";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { brandOf, useDesigners, useFavorites, useMeasurements, usePlatformSettings } from "@/lib/queries";
import { money } from "@/lib/format";
import { friendly } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { startPayment } from "@/lib/pay";
import { REQUIRED_MEASUREMENTS, type Order, type Product } from "@/lib/types";

export default function ProductSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { priv, profile } = useAuth();
  const { data: designers } = useDesigners();
  const { data: meas } = useMeasurements();
  const { data: settings } = usePlatformSettings();
  const fav = useFavorites();
  const [customizing, setCustomizing] = useState(false);
  const [color, setColor] = useState(product.options.colors[0] ?? "Original");
  const [fit, setFit] = useState(product.options.fits[0] ?? "Signature");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"view" | "pay">("view");
  const [plan, setPlan] = useState<"full" | "deposit">("full");
  const [busy, setBusy] = useState(false);

  const designer = designers?.find((d) => d.user_id === product.designer_id);
  const depositPct = Number(settings?.deposit_percent ?? 50);
  const deposit = Math.round((product.price_minor * depositPct) / 100);
  const hasAddress = Boolean(priv?.address?.line1 && priv.address.city && priv.address.country);
  const measCount = Object.keys(meas?.sizes ?? {}).length;
  const missing = useMemo(() => [
    ...(!hasAddress ? [{ label: "Add your delivery address", to: "/profile" }] : []),
    ...(measCount < REQUIRED_MEASUREMENTS ? [{ label: `Add at least ${REQUIRED_MEASUREMENTS} measurements`, to: "/fit" }] : []),
  ], [hasAddress, measCount]);
  const isClient = profile?.role === "client";

  const placeOrder = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_order", {
        p_product: product.id, p_options: customizing && product.customizable ? { color, fit } : {}, p_note: note || null, p_plan: plan,
      });
      if (error) throw error;
      const order = data as Order;
      void qc.invalidateQueries({ queryKey: ["orders"] });
      nav(`/orders/${order.id}`);
      onClose();
      try { await startPayment(order.id, plan); } catch (e) { toast(friendly(e), "error"); }
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(false); }
  };

  return (
    <Sheet onClose={onClose} label={product.name}>
      <div className="product-visual">
        <div className="gallery" tabIndex={0} aria-label="Product photos">
          {product.image_urls.map((u, i) => <img key={u} src={u} alt={i === 0 ? product.name : ""} loading={i ? "lazy" : "eager"} />)}
        </div>
        <span className="tag">{product.category}</span>
        {isClient && <button className={`heart ${fav.ids.has(product.id) ? "on" : ""}`} aria-label={fav.ids.has(product.id) ? "Remove from saved" : "Save piece"} aria-pressed={fav.ids.has(product.id)} onClick={() => fav.toggle(product.id)}><Icon name="heart" size={18} /></button>}
      </div>
      <div className="product-body">
        {step === "view" ? (
          <>
            <span className="product-designer">BY {(designer?.brand_name ?? brandOf(designers, product.designer_id)).toUpperCase()}</span>
            <h2>{product.name}</h2>
            <p className="product-detail">{[product.fabric, product.color].filter(Boolean).join(" · ")}</p>
            <strong className="product-price">{money(product.price_minor, product.currency)}</strong>
            {product.description && <p className="product-description">{product.description}</p>}
            <div className="craft-details">
              <div><span>Made to order</span><b>~{Math.max(1, Math.round(product.lead_time_days / 7))} weeks</b></div>
              <div><span>Fit</span><b>From your profile</b></div>
              <div><span>Alterations</span><b>Ask your tailor</b></div>
            </div>
            {product.customizable ? (
              <>
                <button className={`customize-toggle ${customizing ? "open" : ""}`} aria-expanded={customizing} onClick={() => setCustomizing(!customizing)}>
                  <span><Icon name="sparkle" size={17} /><b>Customize this piece</b><small>Enabled by the designer</small></span><Icon name="chevron" size={17} />
                </button>
                {customizing && (
                  <div className="customizer">
                    <label>Color</label>
                    <div className="choice-row">{product.options.colors.map((x) => <button key={x} className={color === x ? "active" : ""} onClick={() => setColor(x)}>{x}</button>)}</div>
                    <label>Preferred fit</label>
                    <div className="choice-row">{product.options.fits.map((x) => <button key={x} className={fit === x ? "active" : ""} onClick={() => setFit(x)}>{x}</button>)}</div>
                    <label htmlFor="tnote">Note for your tailor</label>
                    <textarea id="tnote" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Sleeve, length or styling requests…" />
                  </div>
                )}
              </>
            ) : <div className="edition-note"><Icon name="lock" size={16} /><span><b>Designer edition</b><small>This silhouette is offered in its original form.</small></span></div>}
            {isClient && <Button className="full" onClick={() => setStep("pay")}>Order made-to-measure <Icon name="arrow" size={16} /></Button>}
          </>
        ) : (
          <>
            <button className="link back-link" onClick={() => setStep("view")}><Icon name="back" size={15} /> Back</button>
            <h2>Checkout</h2>
            <p className="product-detail">{product.name}{customizing && product.customizable ? ` · ${color}, ${fit}` : ""}</p>
            {missing.length > 0 ? (
              <div className="callout warn">
                <b>Before you can order</b>
                {missing.map((m) => <button key={m.label} className="link" onClick={() => { onClose(); nav(m.to); }}>{m.label} <Icon name="chevron" size={14} /></button>)}
              </div>
            ) : (
              <>
                <div className="plan-list" role="radiogroup" aria-label="Payment plan">
                  <button role="radio" aria-checked={plan === "full"} className={plan === "full" ? "active" : ""} onClick={() => setPlan("full")}>
                    <span><b>Pay in full</b><small>One payment today</small></span><strong>{money(product.price_minor, product.currency)}</strong>
                  </button>
                  <button role="radio" aria-checked={plan === "deposit"} className={plan === "deposit" ? "active" : ""} onClick={() => setPlan("deposit")}>
                    <span><b>Pay a {depositPct}% deposit</b><small>Balance due before shipping</small></span><strong>{money(deposit, product.currency)}</strong>
                  </button>
                </div>
                <div className="summary-rows">
                  <div><span>Delivery to</span><b>{priv?.address?.city}, {priv?.address?.country}</b></div>
                  <div><span>Measurements</span><b>{measCount} saved</b></div>
                  <div><span>Due today</span><b>{money(plan === "full" ? product.price_minor : deposit, product.currency)}</b></div>
                </div>
                <p className="fine"><Icon name="lock" size={12} /> Secure checkout by our payment partner. Your tailor receives your measurements only once you've paid.</p>
                <Button className="full" loading={busy} onClick={placeOrder}><Icon name="card" size={18} /> Pay {money(plan === "full" ? product.price_minor : deposit, product.currency)}</Button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
