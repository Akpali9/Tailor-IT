import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Header, Loading } from "@/components/ui";
import Icon from "@/components/Icon";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { friendly } from "@/lib/errors";
import { pickPhoto } from "@/lib/native";
import { resizeImage } from "@/lib/image";
import { CURRENCIES } from "@/lib/countries";
import { toMajor, toMinor } from "@/lib/format";
import type { Product } from "@/lib/types";

const csv = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 8);

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { session, designer } = useAuth();
  const uid = session!.user.id;
  const [productId] = useState(() => (isNew ? crypto.randomUUID() : id!));
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "ai" | "img">("");
  const [images, setImages] = useState<string[]>([]);
  const [f, setF] = useState({ name: "", fabric: "", color: "", category: "Women" as Product["category"], description: "", price: "", currency: "NGN", customizable: false, colors: "Original", fits: "Signature", lead: "21" });
  const [status, setStatus] = useState<Product["status"]>("draft");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (isNew) {
      void supabase.from("designer_payout").select("currency").maybeSingle().then(({ data }) => data?.currency && set("currency", data.currency));
      return;
    }
    void supabase.from("products").select("*").eq("id", id!).single().then(({ data }) => {
      const p = data as Product | null;
      if (!p) { nav("/collection", { replace: true }); return; }
      setImages(p.image_urls); setStatus(p.status);
      setF({ name: p.name, fabric: p.fabric ?? "", color: p.color ?? "", category: p.category, description: p.description ?? "", price: String(toMajor(p.price_minor, p.currency)), currency: p.currency, customizable: p.customizable, colors: p.options.colors.join(", "), fits: p.options.fits.join(", "), lead: String(p.lead_time_days) });
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhoto = async () => {
    if (images.length >= 6) return toast("You can add up to 6 photos", "error");
    const blob = await pickPhoto();
    if (!blob) return;
    setBusy("img");
    try {
      const small = await resizeImage(blob, 1600, 0.85);
      const path = `${uid}/${productId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("product-images").upload(path, small, { contentType: "image/jpeg" });
      if (error) throw error;
      setImages((x) => [...x, supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl]);
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(""); }
  };
  const removePhoto = (url: string) => {
    setImages((x) => x.filter((u) => u !== url));
    const marker = "/product-images/";
    const path = url.includes(marker) ? url.split(marker)[1] : null;
    if (path) void supabase.storage.from("product-images").remove([path]);
  };

  const writeCopy = async () => {
    if (!images[0]) return toast("Add a photo first", "error");
    setBusy("ai");
    try {
      const r = await api.productCopy(images[0], f.name || undefined);
      setF((x) => ({ ...x, name: x.name || r.name, description: r.description, fabric: x.fabric || r.fabric, color: x.color || r.color, category: r.category }));
      toast("Draft written — review and edit before publishing", "success");
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(""); }
  };

  const save = async (publish: boolean) => {
    const price = parseFloat(f.price.replace(",", "."));
    if (f.name.trim().length < 2) return toast("Give your piece a name", "error");
    if (!(price > 0)) return toast("Enter a valid price", "error");
    if (publish && images.length === 0) return toast("Add at least one photo to publish", "error");
    const colors = csv(f.colors), fits = csv(f.fits);
    setBusy(publish ? "publish" : "save");
    try {
      const row = {
        designer_id: uid, name: f.name.trim(), fabric: f.fabric.trim() || null, color: f.color.trim() || null, category: f.category,
        description: f.description.trim() || null, price_minor: toMinor(price, f.currency), currency: f.currency, customizable: f.customizable,
        options: { colors: colors.length ? colors : ["Original"], fits: fits.length ? fits : ["Signature"] },
        lead_time_days: Math.min(180, Math.max(1, parseInt(f.lead) || 21)), image_urls: images, status: publish ? "live" : status === "live" && !publish ? "draft" : status,
      };
      const { error } = isNew ? await supabase.from("products").insert({ id: productId, ...row }) : await supabase.from("products").update(row).eq("id", productId);
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ["my-products"] }); void qc.invalidateQueries({ queryKey: ["products"] }); void qc.invalidateQueries({ queryKey: ["designer-stats"] });
      toast(publish ? "Published — now live for try-on" : "Saved as draft", "success");
      nav("/collection", { replace: true });
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(""); }
  };

  const archive = async () => {
    if (!window.confirm("Remove this piece from your collection? Existing orders are not affected.")) return;
    const { error } = await supabase.from("products").update({ status: "archived" }).eq("id", productId);
    if (error) return toast(friendly(error), "error");
    void qc.invalidateQueries({ queryKey: ["my-products"] }); void qc.invalidateQueries({ queryKey: ["products"] });
    nav("/collection", { replace: true });
  };

  if (loading) return <><Header title="Piece" back /><Loading /></>;
  return (
    <>
      <Header title={isNew ? "New piece" : "Edit piece"} subtitle={status === "live" ? "Live in the marketplace" : "Draft"} back right={<span />} />
      <section className="card">
        <h3>Photos</h3>
        <p className="fine">The first photo is used for virtual try-on, so choose a clear, front-facing shot of the garment (flat-lay or on a model).</p>
        <div className="photo-row">
          {images.map((u, i) => (
            <div key={u} className="photo"><img src={u} alt={`Photo ${i + 1}`} />{i === 0 && <span>Cover</span>}
              <button aria-label="Remove photo" onClick={() => removePhoto(u)}><Icon name="x" size={13} /></button>
              {i > 0 && <button className="mk" aria-label="Make cover" onClick={() => setImages((x) => [u, ...x.filter((y) => y !== u)])}>★</button>}</div>
          ))}
          {images.length < 6 && <button className="photo add" onClick={addPhoto} disabled={busy === "img"} aria-label="Add photo">{busy === "img" ? "…" : <Icon name="plus" size={22} />}</button>}
        </div>
        <Button variant="secondary" className="full" disabled={!images[0]} loading={busy === "ai"} onClick={writeCopy}><Icon name="sparkle" size={16} /> Write my listing with AI</Button>
      </section>

      <section className="card">
        <h3>Details</h3>
        <Field label="Name"><input value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="two">
          <Field label="Price"><input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0" /></Field>
          <Field label="Currency"><select value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <div className="two">
          <Field label="Fabric"><input value={f.fabric} onChange={(e) => set("fabric", e.target.value)} placeholder="Silk charmeuse" /></Field>
          <Field label="Colour"><input value={f.color} onChange={(e) => set("color", e.target.value)} placeholder="Ivory" /></Field>
        </div>
        <div className="two">
          <Field label="Category"><select value={f.category} onChange={(e) => set("category", e.target.value as Product["category"])}><option>Women</option><option>Men</option><option>Unisex</option></select></Field>
          <Field label="Lead time (days)"><input inputMode="numeric" value={f.lead} onChange={(e) => set("lead", e.target.value)} /></Field>
        </div>
        <Field label="Description"><textarea value={f.description} maxLength={800} onChange={(e) => set("description", e.target.value)} /></Field>
        <label className="setting-toggle"><span><strong>Allow customization</strong><small>Let clients choose a colour and fit</small></span><input type="checkbox" role="switch" checked={f.customizable} onChange={(e) => set("customizable", e.target.checked)} /></label>
        {f.customizable && <><Field label="Colour options" hint="Comma separated"><input value={f.colors} onChange={(e) => set("colors", e.target.value)} /></Field><Field label="Fit options" hint="Comma separated"><input value={f.fits} onChange={(e) => set("fits", e.target.value)} /></Field></>}
      </section>

      {!designer?.accepting_orders && <p className="callout warn"><b>Payouts not set up</b>Clients can try this on, but can't order until you connect payouts.</p>}
      <Button className="full" loading={busy === "publish"} onClick={() => save(true)}>{status === "live" ? "Save changes" : "Publish piece"}</Button>
      <Button variant="secondary" className="full" loading={busy === "save"} onClick={() => save(false)}>{status === "live" ? "Unpublish (save as draft)" : "Save draft"}</Button>
      {!isNew && <Button variant="ghost" className="full" onClick={archive}><Icon name="trash" size={16} /> Remove piece</Button>}
    </>
  );
}
