import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && anon && !url.includes("YOUR-PROJECT"));

// Session tokens live in the iOS Keychain / Android Keystore-backed storage on device (not plain localStorage).
const native = Capacitor.isNativePlatform();
let ready: Promise<void> | null = null;
const init = () => (ready ??= SecureStorage.setKeyPrefix("tailorit_").catch(() => undefined));
const storage = native
  ? {
      getItem: async (k: string) => { await init(); return ((await SecureStorage.get(k, false)) as string | null) ?? null; },
      setItem: async (k: string, v: string) => { await init(); await SecureStorage.set(k, v, false); },
      removeItem: async (k: string) => { await init(); await SecureStorage.remove(k); },
    }
  : window.localStorage;

export const supabase = createClient(url || "https://placeholder.supabase.co", anon || "placeholder", {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: "pkce" },
});

export const APP_SCHEME = import.meta.env.VITE_APP_SCHEME || "tailorit";

export function publicUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
