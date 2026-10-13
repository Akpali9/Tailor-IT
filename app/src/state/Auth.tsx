import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { APP_SCHEME, supabase } from "@/lib/supabase";
import type { DesignerProfile, PrivateProfile, Profile, Role } from "@/lib/types";
import { registerPush, unregisterPush } from "@/lib/push";
import { setPrivacyShield } from "@/lib/native";

interface SignUpInput { email: string; password: string; fullName: string; role: Role; referral?: string }
interface AuthState {
  session: Session | null; loading: boolean; recovering: boolean;
  profile: Profile | null; priv: PrivateProfile | null; designer: DesignerProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (i: SignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refresh: () => Promise<void>;
  handleAuthLink: (url: string) => Promise<"recovery" | "signed_in" | "none">;
  setNotificationTap: (fn: (data: Record<string, string>) => void) => void;
}
const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error("AuthProvider missing"); return c; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [priv, setPriv] = useState<PrivateProfile | null>(null);
  const [designer, setDesigner] = useState<DesignerProfile | null>(null);
  const tapRef = useRef<(d: Record<string, string>) => void>(() => undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") { setProfile(null); setPriv(null); setDesigner(null); setLoading(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (uid: string) => {
    const [p, pp, d] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase.from("profile_private").select("*").eq("user_id", uid).single(),
      supabase.from("designer_profiles").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((p.data as Profile) ?? null);
    setPriv((pp.data as PrivateProfile) ?? null);
    setDesigner((d.data as DesignerProfile) ?? null);
    setLoading(false);
  }, []);

  const uid = session?.user.id;
  useEffect(() => { if (uid) void load(uid); }, [uid, load]);

  // Device setup once we know who the user is.
  useEffect(() => {
    if (!uid || !priv) return;
    void setPrivacyShield(priv.privacy_shield);
    if (priv.push_enabled) void registerPush(uid, (d) => tapRef.current(d));
  }, [uid, priv?.privacy_shield, priv?.push_enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AuthState>(() => ({
    session, loading, recovering, profile, priv, designer,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    signUp: async ({ email, password, fullName, role, referral }) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: fullName.trim(), role, referral_code: referral?.trim() || undefined }, emailRedirectTo: `${APP_SCHEME}://auth/callback` },
      });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    signOut: async () => {
      await unregisterPush();
      await supabase.auth.signOut();
      qc.clear();
    },
    sendReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${APP_SCHEME}://auth/reset` });
      if (error) throw error;
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecovering(false);
    },
    refresh: async () => { if (uid) await load(uid); },
    handleAuthLink: async (url) => {
      const u = new URL(url.replace(`${APP_SCHEME}://`, "https://app.local/"));
      const code = u.searchParams.get("code");
      if (!code) return "none";
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (u.pathname.includes("reset")) { setRecovering(true); return "recovery"; }
      return "signed_in";
    },
    setNotificationTap: (fn) => { tapRef.current = fn; },
  }), [session, loading, recovering, profile, priv, designer, uid, load, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
