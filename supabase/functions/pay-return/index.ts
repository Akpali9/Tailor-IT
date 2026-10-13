import { serve } from "../_shared/http.ts";

// Hosted checkouts redirect here; we bounce into the app through its custom URL scheme.
// (Supabase serves function HTML as text/plain, so a redirect is the only reliable hand-off.)
serve(async (req) => {
  const url = new URL(req.url);
  const scheme = Deno.env.get("APP_SCHEME") || "tailorit";
  const provider = url.searchParams.get("provider") ?? "";
  const ref = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  const status = url.searchParams.get("status") ?? "";
  let target: string;
  if (provider === "stripe_onboard") target = `${scheme}://payout/return`;
  else target = `${scheme}://pay/return?reference=${encodeURIComponent(ref)}&status=${encodeURIComponent(status)}`;
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}, ["GET"]);
