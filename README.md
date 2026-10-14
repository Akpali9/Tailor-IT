# Tailor IT


Made-to-measure fashion, marketplace and AI fitting room — **Android + iOS** app (Capacitor + React), a **Supabase** backend, and a **private admin console**.

```
tailor-it/
├─ app/        Mobile app (React + TypeScript + Capacitor 8) — Android & iOS projects included
├─ admin/      Private admin console (separate app; NOT part of the mobile bundle)
├─ supabase/   Postgres schema + RLS, 14 Edge Functions, SQL tests
├─ scripts/    Demo seed + admin bootstrap
└─ docs/       Deployment, security model, architecture, store listing, legal drafts
```

## What's inside

| Area | What it does |
|---|---|
| **Clients** | Sign up, browse designers & pieces, favourites/follows, **AI virtual try-on**, **AI measurement estimate**, **AI stylist chat**, fit profile, made-to-measure checkout (full or deposit), order tracking, notifications |
| **Designers** | Studio dashboard, collection manager with photo upload + **AI listing copy**, production pipeline, client orders with measurement snapshot, **payout onboarding** (Paystack NG/GH/KE/ZA, Stripe Connect elsewhere), earnings |
| **Payments** | Hosted checkout (card, bank, wallet, Apple/Google Pay where the provider supports it). Amounts, fees and splits computed **server-side**; signed webhooks; idempotent; refunds from admin |
| **Admin console** | Private, MFA-enforced. Overview, users (suspend / verify designers), orders & refunds, **messages** (in-app + push to clients, designers, everyone or one user), **adverts** (home banner, feed card, designer home, full-screen) with impression/click stats, fee settings, audit log |
| **AI** | Claude (stylist, photo→measurements, listing & ad copy) and FASHN (virtual try-on) — keys live only in Edge Functions |
| **Privacy** | RLS everywhere; designers see an order's measurements/address only after payment; explicit AI consent; photo auto-deletion; in-app account deletion; screen-privacy shield |

## Quick start (local)

```bash
# 1. Backend
supabase start && supabase db reset          # applies supabase/migrations
cp supabase/functions/.env.example supabase/functions/.env   # fill keys
supabase functions serve --env-file supabase/functions/.env

# 2. App in the browser (fast UI work)
cd app && cp .env.example .env.local         # set VITE_SUPABASE_URL / ANON_KEY
npm install && npm run dev

# 3. Demo data + an admin
cd ../scripts && npm i
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node seed.mjs
ADMIN_EMAIL=you@co.com ADMIN_PASSWORD='14+ char password' SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node create-admin.mjs

# 4. Admin console (local only by default)
cd ../admin && cp .env.example .env.local && npm i && npm run dev   # http://127.0.0.1:5180
```

Production deployment, store submission and provider setup: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Honest status — what was and wasn't verified

**Verified in development:**
- All three SQL migrations apply cleanly to Postgres 16, and **31 assertions** pass (`supabase/tests/run.sh`): server-side pricing, RLS isolation between users, designers blocked from unpaid orders, payment idempotency & amount-mismatch rejection, refunds, admin MFA gating, privilege lockdown, ad dedupe, promo opt-in rules, AI quotas.
- All 14 Edge Functions type-check under Deno; webhook signature verification tested against independently computed HMACs (Paystack SHA-512, Stripe SHA-256 incl. tamper/stale cases).
- Mobile app and admin console type-check and production-build; Capacitor Android + iOS projects generate, with deep links, permissions and icons/splash applied.

**Not verified here — you must test with real credentials/devices:**
- Live calls to Claude, FASHN, Paystack, Stripe and Firebase (no keys/network from the build environment). Request shapes follow the providers' current docs; run a sandbox transaction and a try-on before launch.
- Native builds: no Android SDK / Xcode here. Open `app/android` in Android Studio and `app/ios` on a Mac.
- iOS push needs Firebase wired into the Xcode project (see DEPLOYMENT §7) — Android works once `google-services.json` is added.
- The UI has not been exercised on physical devices; expect a round of visual polish.
- Legal: `docs/legal/*` are **drafts**. Have a lawyer review them (payments, AI photo processing, NDPR/GDPR) before publishing.

## Things deliberately left out (next steps)
Client↔designer chat, reviews & ratings, shipping-carrier integration, multi-language, crash reporting (add Sentry), social login, referral credits (invite codes are tracked, no monetary reward), and a designer-purchased promotion product.
