# Architecture

```
 Mobile app (Capacitor/React) ──┐                    ┌── Claude API  (stylist, measurements, copy)
 Admin console (React, private) ┼─► Supabase ───────►├── FASHN API   (virtual try-on)
                                │   ├ Auth (+TOTP)   ├── Paystack / Stripe (checkout, split payouts, refunds)
                                │   ├ Postgres + RLS └── Firebase FCM (push)
                                │   ├ Storage
                                │   └ Edge Functions (secrets live only here)
```

## Principles
1. **The client is untrusted.** Prices, fees, deposit amounts and payment status are computed in SQL/Edge Functions. The app never sends an amount.
2. **Closed by default.** Every table has RLS and zero grants until explicitly given; functions are revoked from `PUBLIC` and granted one by one.
3. **Webhook = truth.** An order becomes *paid* only via the signed provider webhook → `apply_payment()` (idempotent, amount/currency verified).
4. **Least data.** Designers see measurements/address only after payment; photos are deleted automatically; AI use needs explicit consent.

## Payment flow
`create_order` (price, fee, snapshot) → `checkout-create` (decides amount, creates `payments` row, provider hosted checkout with split) → user pays in in-app browser → provider redirects to `pay-return` → `tailorit://pay/return` → app polls → webhook calls `apply_payment` → notifications. Balance: designer `request_balance` → client pays `balance`; `advance_order('shipped')` is refused until fully paid.

Split: Paystack `subaccount` + flat `transaction_charge` (platform fee); Stripe destination charge + `application_fee_amount`.

## Messaging & adverts
`broadcasts` → `send_broadcast()` inserts in-app notifications (promos only for opted-in users) → `admin-broadcast` pushes via FCM. Per-event notifications (orders/payments) are inserted in SQL; a trigger posts them to `push-dispatch`. `ads` are served by `get_ads(placement)` (audience-filtered) and tracked by `track_ad()` (deduped per user/day).

## Scaling notes
Catalogue and designer lists are fetched in one page (200/300 rows) and filtered client-side — add server pagination past a few thousand pieces. Push fan-out uses bounded concurrency in a single function run; move to a queue for 100k+ audiences.
