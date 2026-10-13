import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, Field, Header, Sheet } from "@/components/ui";
import Icon from "@/components/Icon";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { useFavorites, usePlatformSettings } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { friendly } from "@/lib/errors";
import { openUrl, pickPhoto, setPrivacyShield, shareLink } from "@/lib/native";
import { resizeImage } from "@/lib/image";
import { COUNTRIES } from "@/lib/countries";
import type { Address } from "@/lib/types";

type Panel = null | "personal" | "notifications" | "privacy" | "studio" | "delete";

export default function Profile() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { profile, priv, designer, session, refresh, signOut } = useAuth();
  const { data: settings } = usePlatformSettings();
  const favs = useFavorites();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  if (!profile || !priv) return null;
  const isDesigner = profile.role === "designer";
  const close = () => setPanel(null);
  const support = String(settings?.support_email ?? "support@tailorit.app");

  const changeAvatar = async () => {
    const blob = await pickPhoto();
    if (!blob) return;
    try {
      const small = await resizeImage(blob, 480, 0.85);
      const path = `${session!.user.id}/avatar.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, small, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error: e2 } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
      if (e2) throw e2;
      await refresh(); toast("Photo updated", "success");
    } catch (e) { toast(friendly(e), "error"); }
  };

  const invite = async () => {
    const r = await shareLink({ title: "Join me on Tailor IT", text: `Get clothes made for your body with Tailor IT. Use my invite code ${priv.referral_code} when you sign up.`, url: "https://tailorit.app" });
    if (r === "copied") toast("Invite copied to clipboard", "success");
  };
  const savePriv = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("profile_private").update(patch).eq("user_id", profile.id);
    if (error) { toast(friendly(error), "error"); return false; }
    await refresh(); return true;
  };

  return (
    <>
      <Header title="Profile" subtitle="Your place in the fashion community" />
      <section className="profile-card">
        <button className="avatar-btn" onClick={changeAvatar} aria-label="Change profile photo"><Avatar name={profile.full_name} src={profile.avatar_url} size={84} /><span><Icon name="camera" size={14} /></span></button>
        <h2>{isDesigner ? designer?.brand_name || profile.full_name : profile.full_name}</h2>
        <p>@{profile.handle} · {isDesigner ? (designer?.verified ? "Verified designer" : "Designer") : "Fashion collector"}</p>
        <div className="social-counts">
          {isDesigner ? <><div><strong>{designer?.followers_count ?? 0}</strong><span>Followers</span></div><div><strong>{designer?.accepting_orders ? "Open" : "Paused"}</strong><span>Orders</span></div></>
            : <><div><strong>{favs.ids.size}</strong><span>Saved looks</span></div></>}
        </div>
      </section>

      <section className="referral-card">
        <span><Icon name="sparkle" size={17} /></span>
        <div><small>TAILOR IT CIRCLE</small><h3>Invite a fashion lover</h3><p>Share your code <b>{priv.referral_code}</b> with friends.</p><Button variant="secondary" onClick={invite}><Icon name="share" size={15} /> Share invite</Button></div>
      </section>

      <section className="settings-card">
        {isDesigner && <>
          <button onClick={() => setPanel("studio")}><Icon name="hanger" /><span><strong>Studio profile</strong><small>Brand name, specialty and bio</small></span><Icon name="chevron" /></button>
          <button onClick={() => nav("/payouts")}><Icon name="card" /><span><strong>Payouts & earnings</strong><small>{designer?.accepting_orders ? "Receiving payments" : "Set up to start selling"}</small></span><Icon name="chevron" /></button>
        </>}
        <button onClick={() => setPanel("personal")}><Icon name="user" /><span><strong>Personal information</strong><small>Name, phone and delivery address</small></span><Icon name="chevron" /></button>
        <button onClick={() => setPanel("notifications")}><Icon name="bell" /><span><strong>Notifications</strong><small>Push and promotions</small></span><Icon name="chevron" /></button>
        <button onClick={() => setPanel("privacy")}><Icon name="lock" /><span><strong>Privacy & data</strong><small>Screen shield, AI consent</small></span><Icon name="chevron" /></button>
        <button onClick={() => void openUrl(String(settings?.terms_url ?? "https://tailorit.app/terms"))}><Icon name="info" /><span><strong>Terms of Service</strong></span><Icon name="chevron" /></button>
        <button onClick={() => void openUrl(String(settings?.privacy_url ?? "https://tailorit.app/privacy"))}><Icon name="shield" /><span><strong>Privacy Policy</strong></span><Icon name="chevron" /></button>
        <button onClick={() => { window.location.href = `mailto:${support}?subject=Tailor%20IT%20support`; }}><Icon name="send" /><span><strong>Contact support</strong><small>{support}</small></span><Icon name="chevron" /></button>
        <button onClick={() => void signOut()}><Icon name="logout" /><span><strong>Sign out</strong></span><Icon name="chevron" /></button>
        <button className="danger" onClick={() => setPanel("delete")}><Icon name="trash" /><span><strong>Delete account</strong><small>Permanently remove your data</small></span><Icon name="chevron" /></button>
      </section>
      <p className="version">Tailor IT v1.0.0</p>

      {panel === "personal" && <PersonalSheet onClose={close} onSaved={async () => { await refresh(); void qc.invalidateQueries(); close(); toast("Saved", "success"); }} />}
      {panel === "studio" && designer && <StudioSheet onClose={close} onSaved={async () => { await refresh(); close(); toast("Studio updated", "success"); }} />}
      {panel === "notifications" && (
        <Sheet onClose={close} label="Notifications"><div className="sheet-pad"><h2>Notifications</h2>
          <Toggle label="Push notifications" hint="Orders, payments and important updates" checked={priv.push_enabled} onChange={(v) => savePriv({ push_enabled: v })} />
          <Toggle label="Promotions & offers" hint="Occasional news from Tailor IT. Never required." checked={priv.marketing_opt_in} onChange={(v) => savePriv({ marketing_opt_in: v })} />
          <p className="fine">Order and payment messages are always delivered in the app.</p></div></Sheet>
      )}
      {panel === "privacy" && (
        <Sheet onClose={close} label="Privacy"><div className="sheet-pad"><h2>Privacy & data</h2>
          <Toggle label="Screen privacy shield" hint="Hides previews in the app switcher and blocks screenshots (where supported)" checked={priv.privacy_shield} onChange={async (v) => { if (await savePriv({ privacy_shield: v })) void setPrivacyShield(v); }} />
          <Toggle label="AI features" hint={priv.ai_consent_at ? "Photos and measurements may be processed by our AI partners" : "Off — you'll be asked before first use"} checked={!!priv.ai_consent_at} onChange={(v) => savePriv({ ai_consent_at: v ? new Date().toISOString() : null })} />
          <p className="fine">Try-on source photos are deleted after 7 days and previews after 30 days. Deleting your account removes your photos and measurements.</p></div></Sheet>
      )}
      {panel === "delete" && <DeleteSheet busy={busy} onClose={close} onConfirm={async () => {
        setBusy(true);
        try { await api.deleteAccount(); await signOut(); } catch (e) { toast(friendly(e), "error"); } finally { setBusy(false); }
      }} />}
    </>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting-toggle"><span><strong>{label}</strong><small>{hint}</small></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>
  );
}

function PersonalSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile, priv } = useAuth();
  const toast = useToast();
  const a = priv?.address;
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(priv?.phone ?? "");
  const [addr, setAddr] = useState<Address>({ line1: a?.line1 ?? "", line2: a?.line2 ?? "", city: a?.city ?? "", state: a?.state ?? "", postal_code: a?.postal_code ?? "", country: a?.country ?? "NG" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Address) => (e: { target: { value: string } }) => setAddr({ ...addr, [k]: e.target.value });
  const save = async () => {
    if (name.trim().length < 2) return toast("Enter your name", "error");
    const hasAddr = addr.line1.trim() || addr.city.trim();
    if (hasAddr && (!addr.line1.trim() || !addr.city.trim())) return toast("Address needs a street and city", "error");
    setBusy(true);
    try {
      const r1 = await supabase.from("profiles").update({ full_name: name.trim(), country: addr.country }).eq("id", profile!.id);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from("profile_private").update({ phone: phone.trim() || null, address: hasAddr ? { ...addr, line1: addr.line1.trim(), city: addr.city.trim() } : null }).eq("user_id", profile!.id);
      if (r2.error) throw r2.error;
      onSaved();
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(false); }
  };
  return (
    <Sheet onClose={onClose} label="Personal information"><div className="sheet-pad">
      <h2>Personal information</h2>
      <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Phone (for delivery)"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></Field>
      <h3 className="sub">Delivery address</h3>
      <Field label="Street address"><input value={addr.line1} onChange={set("line1")} autoComplete="address-line1" /></Field>
      <Field label="Apartment, suite (optional)"><input value={addr.line2} onChange={set("line2")} autoComplete="address-line2" /></Field>
      <div className="two"><Field label="City"><input value={addr.city} onChange={set("city")} autoComplete="address-level2" /></Field><Field label="State / region"><input value={addr.state} onChange={set("state")} autoComplete="address-level1" /></Field></div>
      <div className="two"><Field label="Postal code"><input value={addr.postal_code} onChange={set("postal_code")} autoComplete="postal-code" /></Field>
        <Field label="Country"><select value={addr.country} onChange={set("country")}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field></div>
      <Button className="full" loading={busy} onClick={save}>Save</Button>
    </div></Sheet>
  );
}

function StudioSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { designer } = useAuth();
  const toast = useToast();
  const [brand, setBrand] = useState(designer?.brand_name ?? "");
  const [spec, setSpec] = useState(designer?.specialty ?? "");
  const [bio, setBio] = useState(designer?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (brand.trim().length < 2) return toast("Enter a brand name", "error");
    setBusy(true);
    const { error } = await supabase.from("designer_profiles").update({ brand_name: brand.trim(), specialty: spec.trim() || null, bio: bio.trim() || null }).eq("user_id", designer!.user_id);
    setBusy(false);
    if (error) toast(friendly(error), "error"); else onSaved();
  };
  return (
    <Sheet onClose={onClose} label="Studio profile"><div className="sheet-pad">
      <h2>Studio profile</h2>
      <Field label="Brand name"><input value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
      <Field label="Specialty" hint="e.g. Contemporary tailoring"><input value={spec} onChange={(e) => setSpec(e.target.value)} /></Field>
      <Field label="About your studio"><textarea value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} /></Field>
      <Button className="full" loading={busy} onClick={save}>Save</Button>
    </div></Sheet>
  );
}

function DeleteSheet({ onClose, onConfirm, busy }: { onClose: () => void; onConfirm: () => void; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <Sheet onClose={onClose} label="Delete account"><div className="sheet-pad">
      <h2>Delete your account?</h2>
      <p className="fine">This permanently deletes your profile, photos, measurements and saved items. Order records are kept for accounting with your personal details removed. This can't be undone.</p>
      <Field label="Type DELETE to confirm"><input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" /></Field>
      <Button variant="danger" className="full" disabled={text !== "DELETE"} loading={busy} onClick={onConfirm}>Permanently delete</Button>
    </div></Sheet>
  );
}
