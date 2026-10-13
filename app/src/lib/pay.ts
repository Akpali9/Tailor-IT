import { api } from "./api";
import { openUrl } from "./native";
import { supabase } from "./supabase";

export type PayKind = "full" | "deposit" | "balance";

/** Creates a hosted checkout (amount decided server-side) and opens it in the in-app browser. */
export async function startPayment(orderId: string, kind: PayKind): Promise<string> {
  const { url, reference } = await api.checkout(orderId, kind);
  await openUrl(url);
  return reference;
}

/** The provider webhook is the source of truth; poll until it has been applied (or give up). */
export async function waitForPayment(reference: string, timeoutMs = 45_000): Promise<"succeeded" | "failed" | "pending"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.from("payments").select("status,order_id").eq("reference", reference).maybeSingle();
    if (data?.status === "succeeded") return "succeeded";
    if (data?.status === "failed") return "failed";
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "pending";
}
