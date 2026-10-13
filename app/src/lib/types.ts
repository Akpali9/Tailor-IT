export type Role = "client" | "designer";

export interface Profile {
  id: string; role: Role; full_name: string; handle: string | null; avatar_url: string | null; country: string | null; status: "active" | "suspended";
}
export interface Address { line1: string; line2?: string; city: string; state?: string; postal_code?: string; country: string }
export interface PrivateProfile {
  user_id: string; phone: string | null; address: Address | null; referral_code: string | null;
  marketing_opt_in: boolean; push_enabled: boolean; privacy_shield: boolean; ai_consent_at: string | null;
}
export interface DesignerProfile {
  user_id: string; brand_name: string; specialty: string | null; bio: string | null; cover_url: string | null;
  verified: boolean; accepting_orders: boolean; followers_count: number;
}
export interface ProductOptions { colors: string[]; fits: string[] }
export interface Product {
  id: string; designer_id: string; name: string; fabric: string | null; color: string | null; category: "Women" | "Men" | "Unisex";
  description: string | null; price_minor: number; currency: string; customizable: boolean; options: ProductOptions;
  lead_time_days: number; image_urls: string[]; status: "draft" | "live" | "archived"; tryon_count: number; created_at: string;
}
export type OrderStatus = "pending_payment" | "paid" | "cutting" | "assembly" | "fitting_review" | "finishing" | "shipped" | "delivered" | "cancelled" | "refunded";
export interface Order {
  id: string; number: number; client_id: string | null; designer_id: string | null; product_id: string | null;
  product_snapshot: { name: string; image?: string; brand?: string; lead_time_days?: number; fabric?: string };
  options: { color?: string; fit?: string }; note: string | null; measurements_snapshot: Record<string, number>;
  delivery_address: Address; currency: string; amount_minor: number; fee_minor: number; amount_paid_minor: number;
  payment_plan: "full" | "deposit"; status: OrderStatus; estimated_delivery: string | null; tracking: { carrier?: string; number?: string } | null;
  created_at: string;
  client?: { full_name: string; avatar_url: string | null } | null;
}
export interface OrderEvent { id: number; order_id: string; status: OrderStatus; note: string | null; created_at: string }
export interface Payment { id: string; reference: string; kind: string; amount_minor: number; currency: string; status: string; created_at: string; paid_at: string | null }
export interface AppNotification {
  id: number; kind: string; title: string; body: string; data: { order_id?: string; link?: string }; read_at: string | null; created_at: string;
}
export interface Ad { id: string; title: string; body: string | null; image_url: string | null; cta_label: string | null; cta_url: string | null; placement: string }
export interface Measurements { user_id: string; sizes: Record<string, number>; source: "manual" | "ai_estimate" | "mixed"; confidence: number | null; updated_at: string }
export interface DesignerStats {
  active_orders: number; awaiting_review: number; delivered: number; live_products: number; tryons: number;
  earnings: { currency: string; net_minor: number }[];
}
export interface StylistMessage { id: number; role: "user" | "assistant"; content: string; product_ids: string[]; created_at: string }

export const MEASUREMENT_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "height", label: "Height", hint: "Standing, without shoes" },
  { key: "chest_bust", label: "Chest / bust", hint: "Around the fullest part" },
  { key: "waist", label: "Waist", hint: "Natural waistline" },
  { key: "hips", label: "Hips", hint: "Around the fullest part" },
  { key: "shoulder", label: "Shoulder", hint: "Seam to seam across the back" },
  { key: "arm_length", label: "Arm length", hint: "Shoulder point to wrist" },
  { key: "inseam", label: "Inseam", hint: "Crotch to ankle" },
  { key: "neck", label: "Neck", hint: "Around the base" },
  { key: "thigh", label: "Thigh", hint: "Around the fullest part" },
];
export const REQUIRED_MEASUREMENTS = 3;
