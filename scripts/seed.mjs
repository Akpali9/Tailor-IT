// Demo catalogue so the app isn't empty on first launch.
//   cd scripts && npm i && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node seed.mjs
// Demo designers are created with accepting_orders = false: clients can browse and use virtual try-on,
// but ordering requires a designer to connect a REAL payout account (Profile → Payouts).
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });
const img = (id) => `https://images.unsplash.com/${id}?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=88&w=900&h=1200`;

const designers = [
  { slug: "okafor", name: "A. Okafor", specialty: "Modern occasionwear" },
  { slug: "nuru", name: "Atelier Nuru", specialty: "Contemporary tailoring" },
  { slug: "sol", name: "Maison Sol", specialty: "Sculptural essentials" },
  { slug: "fold", name: "Form & Fold", specialty: "Relaxed tailoring" },
];
const products = [
  ["okafor", "The Ada Dress", "Silk charmeuse", "Ivory", "Women", 42000, true, "photo-1659522761084-79196b64abe4", "A bias-cut evening silhouette with a sculpted neckline and hand-finished French seams."],
  ["sol", "Noir Column", "Italian crepe", "Black", "Women", 38000, true, "photo-1663220274232-740f07723310", "An architectural column dress balanced with fluid movement and a softly structured waist."],
  ["okafor", "Solene Gown", "Fluid satin", "Gold", "Women", 52000, false, "photo-1664076458686-3449062080ac", "Light-catching satin draped by hand for an elegant, effortless evening statement."],
  ["nuru", "The Atlas Suit", "Wool twill", "Midnight", "Men", 69000, true, "photo-1790575547092-72c0416fdfc7", "A modern two-piece suit with a softly structured shoulder and precise single-breasted cut."],
  ["fold", "Marlow Blazer", "Wool linen", "Ocean", "Men", 34000, true, "photo-1770404295179-20767296ad2d", "A relaxed tailored blazer designed for refined layering from day into evening."],
  ["nuru", "Kano Shirt", "Organic cotton", "Cocoa", "Men", 18500, false, "photo-1602956280248-66d6efd0ba7d", "A clean, contemporary shirt with an extended collar and subtle artisanal finishing."],
];

async function ensureUser(email, meta) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(18).toString("base64url"), email_confirm: true, user_metadata: meta });
  if (!error) return data.user.id;
  if (!/already/i.test(error.message)) throw error;
  for (let page = 1; page < 20; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = list?.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (!list?.users.length) break;
  }
  throw new Error(`cannot find ${email}`);
}

const ids = {};
for (const d of designers) {
  ids[d.slug] = await ensureUser(`demo-${d.slug}@example.com`, { full_name: d.name, role: "designer" });
  await admin.from("designer_profiles").update({ brand_name: d.name, specialty: d.specialty, verified: true }).eq("user_id", ids[d.slug]);
}
for (const [slug, name, fabric, color, category, price, customizable, photo, description] of products) {
  const { data: exists } = await admin.from("products").select("id").eq("designer_id", ids[slug]).eq("name", name).maybeSingle();
  if (exists) continue;
  const { error } = await admin.from("products").insert({
    designer_id: ids[slug], name, fabric, color, category, description, price_minor: price, currency: "USD", customizable,
    options: { colors: ["Original", "Onyx", "Bordeaux"], fits: ["Signature", "Relaxed", "Sculpted"] }, image_urls: [img(photo)], status: "live",
  });
  if (error) throw error;
}
console.log("Seeded", designers.length, "designers and", products.length, "products.");
