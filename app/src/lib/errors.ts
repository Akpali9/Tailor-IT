const MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in again.",
  account_inactive: "This account is not active. Contact support.",
  daily_limit_reached: "You've reached today's limit for this feature. Try again tomorrow.",
  ai_consent_required: "Please accept the AI processing notice first.",
  ai_unavailable: "Our AI service is busy right now. Please try again in a moment.",
  ai_timeout: "That took too long. Please try again.",
  tryon_unavailable: "The virtual try-on service is busy. Please try again shortly.",
  product_unavailable: "This piece is no longer available.",
  address_required: "Add your delivery address before ordering.",
  measurements_required: "Add at least 3 measurements to your fit profile before ordering.",
  designer_not_accepting_orders: "This designer isn't accepting orders yet.",
  designer_not_accepting_payments: "This designer can't take payments yet.",
  invalid_option: "That customization isn't available.",
  order_not_payable: "This order can't be paid right now.",
  balance_not_payable: "No balance is payable on this order right now.",
  nothing_due: "Nothing is due on this order.",
  invalid_transition: "That step isn't available yet.",
  balance_outstanding: "The client's balance must be paid before shipping.",
  active_orders: "Finish or cancel your active orders before deleting your account.",
  payment_provider_error: "The payment provider couldn't start this payment. Please try again.",
  image_too_large: "That photo is too large. Try a smaller one.",
  not_authenticated: "Please sign in again.",
  product_needs_image: "Add at least one photo before publishing.",
  designer_not_verified: "Your studio must be verified before you can publish.",
};

export class ApiError extends Error {
  constructor(public code: string, message?: string) { super(message ?? MESSAGES[code] ?? "Something went wrong. Please try again."); }
}

/** Turns anything thrown by Supabase / fetch into a friendly message. */
export function friendly(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const msg = (e as { message?: string })?.message ?? "";
  for (const code of Object.keys(MESSAGES)) if (msg.includes(code)) return MESSAGES[code];
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "You appear to be offline. Check your connection and try again.";
  if (/Invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/already registered|already been registered/i.test(msg)) return "An account with this email already exists. Try signing in.";
  if (/Email not confirmed/i.test(msg)) return "Please confirm your email first — check your inbox.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong. Please try again.";
}
