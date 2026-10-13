import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib";
import Login from "./Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Orders from "./pages/Orders";
import Broadcasts from "./pages/Broadcasts";
import Ads from "./pages/Ads";
import Settings from "./pages/Settings";

const PAGES = { Overview: Dashboard, Users, Orders, Messages: Broadcasts, Adverts: Ads, Settings } as const;
type Page = keyof typeof PAGES;
const IDLE_MS = 15 * 60 * 1000;

export default function App() {
  const [state, setState] = useState<"checking" | "out" | "in">("checking");
  const [page, setPage] = useState<Page>("Overview");

  // Resume only if the existing session is already MFA-verified AND the user is still an admin.
  useEffect(() => {
    void (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return setState("out");
      const { data: ok } = await supabase.rpc("is_admin");
      setState(ok === true ? "in" : "out");
    })();
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setState("out"); }, []);

  // Auto sign-out after 15 minutes without interaction.
  useEffect(() => {
    if (state !== "in") return;
    let t = window.setTimeout(signOut, IDLE_MS);
    const reset = () => { window.clearTimeout(t); t = window.setTimeout(signOut, IDLE_MS); };
    const ev = ["pointerdown", "keydown", "scroll"] as const;
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { window.clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [state, signOut]);

  if (state === "checking") return <div className="login"><p className="sub">Loading…</p></div>;
  if (state === "out") return <Login onDone={() => setState("in")} />;
  const View = PAGES[page];
  return (
    <div className="layout">
      <aside className="side">
        <h2><small>TAILOR IT</small>Console</h2>
        {(Object.keys(PAGES) as Page[]).map((p) => <button key={p} className={p === page ? "on" : ""} onClick={() => setPage(p)}>{p}</button>)}
        <span className="spacer" />
        <button onClick={signOut}>Sign out</button>
      </aside>
      <main><View /></main>
    </div>
  );
}
