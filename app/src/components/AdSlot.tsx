import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "./Icon";
import { Sheet, Button } from "./ui";
import { useAds } from "@/lib/queries";
import { supabase, APP_SCHEME } from "@/lib/supabase";
import { openUrl } from "@/lib/native";
import type { Ad } from "@/lib/types";

type Placement = "home_banner" | "feed_card" | "designer_home" | "interstitial";

function useAdActions() {
  const nav = useNavigate();
  const seen = useRef(new Set<string>());
  const impression = (id: string) => {
    if (seen.current.has(id)) return;
    seen.current.add(id);
    void supabase.rpc("track_ad", { p_ad: id, p_kind: "impression" });
  };
  const click = (ad: Ad) => {
    void supabase.rpc("track_ad", { p_ad: ad.id, p_kind: "click" });
    const url = ad.cta_url;
    if (!url) return;
    if (url.startsWith(`${APP_SCHEME}://`)) nav("/" + url.slice(`${APP_SCHEME}://`.length));
    else void openUrl(url);
  };
  return { impression, click };
}

/** Sponsored placement managed from the admin console. Renders nothing when there is no active ad. */
export function AdSlot({ placement }: { placement: Exclude<Placement, "interstitial"> }) {
  const { data } = useAds(placement);
  const { impression, click } = useAdActions();
  const ad = data?.[0];
  useEffect(() => { if (ad) impression(ad.id); }, [ad?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ad) return null;
  return (
    <article className={`ad ${placement}`} aria-label="Sponsored">
      {ad.image_url && <img src={ad.image_url} alt="" loading="lazy" />}
      <div className="ad-body">
        <span className="ad-tag">Sponsored</span>
        <h3>{ad.title}</h3>
        {ad.body && <p>{ad.body}</p>}
        {ad.cta_url && <button className="ad-cta" onClick={() => click(ad)}>{ad.cta_label || "Learn more"} <Icon name="arrow" size={14} /></button>}
      </div>
    </article>
  );
}

const KEY = "tailorit_interstitial_day";
/** Full-screen advert, shown at most once per day. */
export function InterstitialAd() {
  const { data } = useAds("interstitial");
  const { impression, click } = useAdActions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ad = data?.[0];
  useEffect(() => {
    if (!ad) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(KEY) === today) return;
    const t = window.setTimeout(() => { setOpen(true); impression(ad.id); localStorage.setItem(KEY, today); }, 1200);
    return () => window.clearTimeout(t);
  }, [ad?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !ad) return null;
  const close = () => { setOpen(false); void qc.invalidateQueries({ queryKey: ["ads", "interstitial"] }); };
  return (
    <Sheet onClose={close} label="Sponsored message">
      <div className="interstitial">
        {ad.image_url && <img src={ad.image_url} alt="" />}
        <span className="ad-tag">Sponsored</span>
        <h2>{ad.title}</h2>
        {ad.body && <p>{ad.body}</p>}
        {ad.cta_url && <Button onClick={() => { click(ad); close(); }}>{ad.cta_label || "Learn more"}</Button>}
        <button className="link" onClick={close}>Not now</button>
      </div>
    </Sheet>
  );
}
