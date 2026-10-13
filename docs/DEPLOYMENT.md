# Deployment guide

## 0. Decide your identifiers (once)
1. **Bundle / application ID** — default `app.tailorit.mobile`. It can never change after the first store upload. Edit `appId` in `app/capacitor.config.ts`, then regenerate the native projects (§6).
2. **URL scheme** — `tailorit` (payment returns, email links). Change in `VITE_APP_SCHEME`, `APP_SCHEME` (function secret) and `scripts/patch-native.py` if needed.
3. **Payment provider** — use the provider that supports *your business's* country. Paystack serves NG/GH/KE/ZA designers; Stripe Connect serves other countries. You can run both: each designer's provider is chosen at payout onboarding.

## 1. Supabase project
```bash
supabase login && supabase link --project-ref <ref>
supabase db push                                   # runs 0001–0003 migrations
```
Dashboard → **Authentication**
- URL configuration: Site URL `tailorit://auth/callback`; Redirect URLs `tailorit://auth/callback`, `tailorit://auth/reset`.
- Providers → Email: keep *Confirm email* on; minimum password 8+.
- **SMTP**: configure a real provider (Resend/Postmark/SES) — the built-in sender is rate-limited and not for production.
- Multi-factor → TOTP: enabled (required by the admin console).
- Enable CAPTCHA/bot protection and tighten rate limits before launch.

Dashboard → **Database → Extensions**: enable `pg_net` (push fan-out) and `pg_cron` (retention job).

## 2. Secrets & functions
```bash
cp supabase/functions/.env.example supabase/functions/.env     # fill in every value
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy                                      # deploys all; config.toml marks the 4 public ones verify_jwt=false
```
`PUBLIC_FUNCTIONS_URL` must be `https://<ref>.supabase.co/functions/v1`.

## 3. Payments
**Paystack** — Settings → API Keys & Webhooks: webhook URL
`https://<ref>.supabase.co/functions/v1/payments-webhook?provider=paystack`. Your platform fee must exceed Paystack's processing fee (the platform bears it; default fee is 10%, change in Admin → Settings).
**Stripe** — Developers → Webhooks → endpoint `…/payments-webhook?provider=stripe`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Enable Connect (Express). Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
**Test in sandbox first**: create a designer, connect a test payout, place an order, pay, confirm the order flips to *Paid* and both parties get a notification.

## 4. Push notifications (Firebase)
1. Create a Firebase project; add an Android app (your appId) and iOS app.
2. Download `google-services.json` → `app/android/app/`. Download `GoogleService-Info.plist` → `app/ios/App/App/`.
3. Project settings → Service accounts → generate key → minify JSON into `FCM_SERVICE_ACCOUNT_JSON`.
4. Connect the database to the push function (SQL editor):
```sql
select public.set_push_webhook('https://<ref>.supabase.co/functions/v1/push-dispatch', '<PUSH_WEBHOOK_SECRET>');
```
5. Daily photo-retention job:
```sql
select cron.schedule('cleanup-photos', '0 3 * * *', $$
  select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/cleanup-photos',
                       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')) $$);
```

## 5. First admin + demo data
See README quick start (`create-admin.mjs`, `seed.mjs`). Then deploy the console privately — **[ADMIN-SECURITY.md](ADMIN-SECURITY.md)**.

## 6. Build the mobile app
```bash
cd app && cp .env.example .env.local        # production Supabase URL + anon key
npm ci
# If you changed appId: rm -rf android ios && npm run native:add
npm run build && npx cap sync
```
**Android** — `npm run android` (opens Android Studio) → Build → *Generate Signed Bundle (AAB)* → upload to Play Console. Keep the upload keystore safe and backed up.
**iOS (macOS + Xcode)** — `npm run ios` → select your Team, set the bundle ID, then **Signing & Capabilities → + Push Notifications** and **Background Modes → Remote notifications**. Product → Archive → upload to App Store Connect.

## 7. iOS push via Firebase (required for FCM delivery on iOS)
Capacitor returns the raw APNs token on iOS, but the server sends through FCM. Add the Firebase SDK (`FirebaseMessaging`) via Swift Package Manager, call `FirebaseApp.configure()` in `AppDelegate.didFinishLaunching`, and in `didRegisterForRemoteNotificationsWithDeviceToken` set `Messaging.messaging().apnsToken = deviceToken`, fetch the FCM token and post it as `.capacitorDidRegisterForRemoteNotifications` (see Capacitor's Push Notifications + Firebase guide). Upload your APNs auth key in Firebase → Cloud Messaging.

## 8. Store submission notes
- **Payments:** made-to-measure clothing is a physical good, so external payment is permitted (no in-app purchase). Keep it that way — do not sell digital goods through this checkout.
- **Account deletion** is in-app (Profile → Delete account) as both stores require. **Sign in with Apple** is not required because only email/password is offered; add it if you add Google/Facebook login.
- **App Privacy / Data safety forms:** declare name, email, phone, address, photos, body measurements, purchases, device ID (push token); data is linked to the user; used for app functionality; photos shared with AI processors.
- **Review access:** provide a client and a designer test account (use the seed script + a sandbox payout).
- Listing text and screenshot plan: [STORE-LISTING.md](STORE-LISTING.md).

## 9. Pre-launch checklist
- [ ] Sandbox payment, deposit→balance, refund each exercised end to end
- [ ] Try-on and measurement estimate tried with real photos; limits in Admin → Settings reviewed
- [ ] Push received on a real Android and a real iPhone
- [ ] Email confirmation + password reset deep links open the app
- [ ] Legal drafts reviewed; DPAs signed with Anthropic, FASHN, Paystack/Stripe, Firebase, Supabase
- [ ] Admin console reachable only via VPN/allow-list; MFA enrolled; default fee confirmed
- [ ] Crash reporting added (e.g. Sentry) and Supabase backups/PITR enabled
