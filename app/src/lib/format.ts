/** Number of minor-unit digits for a currency (2 for NGN/USD, 0 for JPY...). */
function digits(currency: string): number {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
}
export function money(minor: number, currency: string): string {
  const d = digits(currency);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: d }).format(minor / 10 ** d);
  } catch { return `${currency} ${(minor / 100).toFixed(0)}`; }
}
export const toMinor = (major: number, currency: string) => Math.round(major * 10 ** digits(currency));
export const toMajor = (minor: number, currency: string) => minor / 10 ** digits(currency);

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}
export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return shortDate(iso);
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
export const orderNo = (n: number) => `TI-${n}`;
export const CM_PER_IN = 2.54;
