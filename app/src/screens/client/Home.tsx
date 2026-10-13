import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Header, Skeleton, Empty } from "@/components/ui";
import Icon from "@/components/Icon";
import { AdSlot, InterstitialAd } from "@/components/AdSlot";
import { ProductCard } from "@/components/ProductCard";
import ProductSheet from "@/components/ProductSheet";
import { useAuth } from "@/state/Auth";
import { brandOf, useDesigners, useFavorites, useFollows, useMeasurements, useProducts } from "@/lib/queries";
import { MEASUREMENT_FIELDS, REQUIRED_MEASUREMENTS, type Product } from "@/lib/types";

export default function Home() {
  const nav = useNavigate();
  const { profile, priv } = useAuth();
  const products = useProducts();
  const designers = useDesigners();
  const follows = useFollows();
  const favs = useFavorites();
  const { data: meas } = useMeasurements();
  const [gender, setGender] = useState<"All" | "Women" | "Men">("All");
  const [open, setOpen] = useState<Product | null>(null);

  const first = profile?.full_name.split(" ")[0] ?? "there";
  const visible = (products.data ?? []).filter((p) => gender === "All" || p.category === gender || p.category === "Unisex");
  const filled = Object.keys(meas?.sizes ?? {}).length;
  const needsAddress = !priv?.address?.line1;
  const needsMeasures = filled < REQUIRED_MEASUREMENTS;
  const topDesigners = [...(designers.data ?? [])].sort((a, b) => b.followers_count - a.followers_count).slice(0, 6);

  return (
    <>
      <InterstitialAd />
      <Header title={`Hello, ${first}.`} subtitle="What will we create today?" />

      <section className="hero-card">
        <img src={products.data?.[0]?.image_urls[0] ?? "/favicon.svg"} alt="" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <span><Icon name="sparkle" size={14} /> AI VIRTUAL ATELIER</span>
          <h2>See the fit<br />before the first stitch.</h2>
          <p>Try on designer pieces with your own photo.</p>
          <Button onClick={() => nav("/try-on")}>Start a virtual fitting <Icon name="arrow" size={16} /></Button>
        </div>
      </section>

      {(needsAddress || needsMeasures) && (
        <section className="callout soft" aria-label="Finish setting up">
          <b>Finish setting up to order</b>
          {needsMeasures && <button className="link" onClick={() => nav("/fit")}>Add your measurements <Icon name="chevron" size={14} /></button>}
          {needsAddress && <button className="link" onClick={() => nav("/profile")}>Add a delivery address <Icon name="chevron" size={14} /></button>}
        </section>
      )}

      <AdSlot placement="home_banner" />

      <div className="section-title"><div><span>CURATED FOR YOU</span><h2>New from the atelier</h2></div><button onClick={() => nav("/wardrobe")}>View all</button></div>
      <div className="pills">{(["All", "Women", "Men"] as const).map((x) => <button key={x} className={gender === x ? "active" : ""} onClick={() => setGender(x)}>{x}</button>)}</div>
      {products.isLoading ? <div className="piece-scroll"><Skeleton h={250} className="w156" /><Skeleton h={250} className="w156" /></div>
        : visible.length === 0 ? <Empty icon="hanger" title="No pieces yet" text="New designer pieces will appear here as soon as they're published." />
        : <div className="piece-scroll">{visible.slice(0, 12).map((p) => (
            <ProductCard key={p.id} product={p} brand={brandOf(designers.data, p.designer_id)} saved={favs.ids.has(p.id)} onToggle={() => favs.toggle(p.id)} onOpen={() => setOpen(p)} />
          ))}</div>}

      {topDesigners.length > 0 && <>
        <div className="section-title"><div><span>DESIGNERS TO KNOW</span><h2>Follow their world</h2></div></div>
        <div className="designer-scroll">{topDesigners.map((d) => {
          const on = follows.ids.has(d.user_id);
          const cover = products.data?.find((p) => p.designer_id === d.user_id)?.image_urls[0] ?? d.cover_url ?? "/favicon.svg";
          return (
            <article className="designer-card" key={d.user_id}>
              <img src={cover} alt="" loading="lazy" />
              <div>
                <span>{d.followers_count.toLocaleString()} followers{d.verified ? " · Verified" : ""}</span>
                <h3>{d.brand_name}</h3>
                <p>{d.specialty ?? "Independent designer"}</p>
                <button className={on ? "following" : ""} aria-pressed={on} onClick={() => follows.toggle(d.user_id)}>{on ? "Following" : "+ Follow"}</button>
              </div>
            </article>
          );
        })}</div>
      </>}

      <AdSlot placement="feed_card" />

      <button className="fit-summary" onClick={() => nav("/fit")}>
        <span className="fit-icon"><Icon name="ruler" /></span>
        <span><small>YOUR FIT PROFILE</small><strong>{filled === 0 ? "Start your fit profile" : `${filled} of ${MEASUREMENT_FIELDS.length} measurements`}</strong>
          <em>{filled === 0 ? "Takes about 3 minutes" : meas?.source === "manual" ? "Entered by you" : "Includes an AI estimate"}</em></span>
        <Icon name="chevron" size={18} />
      </button>

      <section className="ai-concierge">
        <span><Icon name="sparkle" /></span>
        <div><small>TAILOR IT AI STYLIST</small><h3>Need a second opinion?</h3><p>Styling advice based on your occasion and taste.</p></div>
        <button aria-label="Open AI stylist" onClick={() => nav("/stylist")}><Icon name="arrow" /></button>
      </section>

      {open && <ProductSheet product={open} onClose={() => setOpen(null)} />}
    </>
  );
}
