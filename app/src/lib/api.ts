import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { ApiError } from "./errors";
import type { Product } from "./types";

/** Calls an Edge Function and converts error bodies like {error:"daily_limit_reached"} into ApiError. */
export async function callFn<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => ({}));
      throw new ApiError(payload?.error ?? "unknown");
    }
    throw error;
  }
  return data as T;
}

export const api = {
  stylist: (message: string) => callFn<{ reply: string; product_ids: string[] }>("stylist", { message }),
  measureEstimate: (image_path: string, height_cm: number) =>
    callFn<{ measurements: Record<string, number>; confidence: number; tips: string[] }>("measure-estimate", { image_path, height_cm }),
  tryonCreate: (product_id: string, input_path: string) => callFn<{ id: string; status: string }>("tryon-create", { product_id, input_path }),
  tryonStatus: (id: string) => callFn<{ status: "processing" | "completed" | "failed"; url?: string; error?: string }>("tryon-status", { id }),
  productCopy: (image_url: string, hint?: string) =>
    callFn<{ name: string; description: string; fabric: string; color: string; category: Product["category"] }>("ai-copy", { mode: "product", image_url, hint }),
  checkout: (order_id: string, kind: "full" | "deposit" | "balance") =>
    callFn<{ url: string; reference: string; amount_minor: number; currency: string }>("checkout-create", { order_id, kind }),
  payout: <T>(body: Record<string, unknown>) => callFn<T>("payout-onboard", body),
  deleteAccount: () => callFn<{ deleted: boolean }>("delete-account"),
};
