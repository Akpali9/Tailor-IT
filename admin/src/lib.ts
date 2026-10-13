import { createClient, FunctionsHttpError } from "@supabase/supabase-js";

// Session lives in sessionStorage (cleared when the tab closes), never localStorage.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL ?? "", import.meta.env.VITE_SUPABASE_ANON_KEY ?? "", {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export async function fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) { const p = await error.context.json().catch(() => ({})); throw new Error(p.message || p.error || "Request failed"); }
    throw error;
  }
  return data as T;
}

export const money = (minor: number, cur: string) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: cur }).format(minor / 100); } catch { return `${cur} ${(minor / 100).toFixed(2)}`; }
};
export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Something went wrong";
