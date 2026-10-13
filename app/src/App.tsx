import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { configured, APP_SCHEME } from "@/lib/supabase";
import { closeBrowser, initNative, isNative } from "@/lib/native";
import { friendly } from "@/lib/errors";
import BottomNav from "@/components/BottomNav";
import Auth from "@/screens/Auth";
import PayReturn from "@/screens/PayReturn";
import Home from "@/screens/client/Home";
import TryOn from "@/screens/client/TryOn";
import Wardrobe from "@/screens/client/Wardrobe";
import Fit from "@/screens/client/Fit";
import Orders from "@/screens/client/Orders";
import Stylist from "@/screens/client/Stylist";
import Studio from "@/screens/designer/Studio";
import Clients from "@/screens/designer/Clients";
import Production from "@/screens/designer/Production";
import Collection from "@/screens/designer/Collection";
import ProductEditor from "@/screens/designer/ProductEditor";
import Payouts from "@/screens/designer/Payouts";
import OrderDetail from "@/screens/shared/OrderDetail";
import Inbox from "@/screens/shared/Inbox";
import Profile from "@/screens/shared/Profile";
import { Spinner } from "@/components/ui";
import Logo from "@/components/Logo";

/** Deep links (payment returns, email links), push taps and resume-refresh. Lives inside the Router. */
function NativeBridge() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { handleAuthLink, setNotificationTap } = useAuth();

  useEffect(() => { void initNative(); }, []);
  useEffect(() => {
    setNotificationTap((d) => {
      if (d.order_id) nav(`/orders/${d.order_id}`);
      else if (d.link?.startsWith(`${APP_SCHEME}://`)) nav("/" + d.link.slice(`${APP_SCHEME}://`.length));
      else nav("/inbox");
    });
  }, [nav, setNotificationTap]);

  useEffect(() => {
    if (!isNative) return;
    const subs = [
      CapApp.addListener("appUrlOpen", async ({ url }) => {
        try {
          if (url.startsWith(`${APP_SCHEME}://pay/return`)) { await closeBrowser(); nav("/pay/return" + url.slice(url.indexOf("?")), { replace: true }); }
          else if (url.startsWith(`${APP_SCHEME}://payout/return`)) { await closeBrowser(); void qc.invalidateQueries({ queryKey: ["payout-status"] }); nav("/payouts", { replace: true }); }
          else if (url.startsWith(`${APP_SCHEME}://auth/`)) { await closeBrowser(); await handleAuthLink(url); }
        } catch (e) { toast(friendly(e), "error"); }
      }),
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) { void qc.invalidateQueries({ queryKey: ["orders"] }); void qc.invalidateQueries({ queryKey: ["order"] }); void qc.invalidateQueries({ queryKey: ["notifications"] }); void qc.invalidateQueries({ queryKey: ["payout-status"] }); }
      }),
    ];
    return () => { subs.forEach((s) => void s.then((h) => h.remove())); };
  }, [nav, qc, handleAuthLink, toast]);
  return null;
}

function Splash() { return <div className="splash"><Logo /><Spinner /></div>; }

function Offline() {
  const [off, setOff] = useState(!navigator.onLine);
  useEffect(() => {
    const a = () => setOff(true), b = () => setOff(false);
    window.addEventListener("offline", a); window.addEventListener("online", b);
    return () => { window.removeEventListener("offline", a); window.removeEventListener("online", b); };
  }, []);
  return off ? <div className="offline" role="alert">You're offline — some features won't work.</div> : null;
}

export default function App() {
  const { session, loading, profile, recovering, signOut } = useAuth();
  const { pathname } = useLocation();

  if (!configured) return <div className="crash"><h1>Setup needed</h1><p>Add your Supabase URL and anon key to <code>.env.local</code> and rebuild.</p></div>;
  if (loading) return <Splash />;
  if (session && recovering) return <><NativeBridge /><Auth initialMode="reset" /></>;
  if (!session) return <><NativeBridge /><Auth /></>;
  if (!profile) return <Splash />;
  if (profile.status === "suspended") {
    return <div className="crash"><h1>Account suspended</h1><p>Your account has been suspended. Contact support if you think this is a mistake.</p><button className="btn primary" onClick={() => void signOut()}>Sign out</button></div>;
  }

  const client = profile.role === "client";
  const chat = pathname === "/stylist";
  return (
    <div className={`mobile-app ${chat ? "no-nav" : ""}`}>
      <NativeBridge />
      <Offline />
      <main className="app-content" id="main">
        <Routes>
          {client ? (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/try-on" element={<TryOn />} />
              <Route path="/wardrobe" element={<Wardrobe />} />
              <Route path="/fit" element={<Fit />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/stylist" element={<Stylist />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Studio />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/production" element={<Production />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/collection/:id" element={<ProductEditor />} />
              <Route path="/payouts" element={<Payouts />} />
            </>
          )}
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/pay/return" element={<PayReturn />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!chat && <BottomNav role={profile.role} />}
    </div>
  );
}
