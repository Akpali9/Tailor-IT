import { env, HttpError, hmac, timingSafeEqual } from "./http.ts";

// ------------------------------------------------------------------ Paystack
const PS = "https://api.paystack.co";
export async function paystack<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(PS + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${env("PAYSTACK_SECRET_KEY")}`, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    console.error("paystack error", path, res.status, JSON.stringify(data));
    throw new HttpError(502, "payment_provider_error", data.message ?? "Paystack request failed");
  }
  return data as T;
}

export async function verifyPaystackSignature(raw: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  return timingSafeEqual(await hmac("SHA-512", env("PAYSTACK_SECRET_KEY"), raw), signature);
}

// -------------------------------------------------------------------- Stripe
function flatten(obj: Record<string, unknown>, prefix = "", out: [string, string][] = []): [string, string][] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => typeof item === "object" ? flatten(item as Record<string, unknown>, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)]));
    else out.push([key, String(v)]);
  }
  return out;
}

export async function stripe<T = any>(path: string, params?: Record<string, unknown>, method = params ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "content-type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(flatten(params)) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("stripe error", path, res.status, JSON.stringify(data));
    throw new HttpError(502, "payment_provider_error", data?.error?.message ?? "Stripe request failed");
  }
  return data as T;
}

/** Verifies the `Stripe-Signature` header (scheme v1, 5 minute tolerance). */
export async function verifyStripeSignature(raw: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = await hmac("SHA-256", env("STRIPE_WEBHOOK_SECRET"), `${parts.t}.${raw}`);
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => timingSafeEqual(p.slice(3), expected));
}
