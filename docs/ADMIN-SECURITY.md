# Admin console — security model

"Not visible online" is implemented in **layers**. Hiding a URL is never the protection; the database is.

| Layer | Control |
|---|---|
| **Separate app** | `admin/` is a different project. Nothing from it is in the mobile bundle or any public site. No link, no sign-up page, `robots.txt: Disallow /`, `noindex` meta + header. |
| **Network** | Deploy it where only staff can reach it: run locally (`npm run dev` binds 127.0.0.1), or behind a VPN (Tailscale/WireGuard), Cloudflare Access/Zero Trust, or an IP allow-list. `admin/Dockerfile` + `nginx.conf` give a ready allow-list example. |
| **Identity** | Admins are rows in `public.admins`, created only with the service key (`scripts/create-admin.mjs`). Nobody can self-promote: the sign-up trigger only ever creates `client`/`designer`. |
| **MFA** | The console forces TOTP enrolment. In the database `is_admin()` requires the JWT claim `aal = aal2`, so **a stolen password alone can read or change nothing**. |
| **Authorisation (server-side)** | Every admin table policy and RPC calls `is_admin()`. Edge Functions (`admin-refund`, `admin-broadcast`, admin mode of `ai-copy`) re-check it. The mobile anon key cannot reach any of it. |
| **Session hygiene** | Session in `sessionStorage` (dies with the tab), 15-minute idle sign-out, strict CSP, `X-Frame-Options: DENY`. |
| **Accountability** | `audit_log` records refunds, suspensions, verifications, settings and broadcasts with the admin's id. |

### Operational rules
- Use a unique 14+ character password per admin and a hardware-backed authenticator where possible.
- Never ship the **service-role key** in any client. It is only used by Edge Functions and the scripts in `scripts/`.
- Rotate the service key and webhook secrets if a staff member leaves.
- Restrict who can create admins by restricting who holds the service key.

### Deploying privately — Cloudflare Access example
1. `cd admin && npm run build`; deploy `dist/` to Cloudflare Pages on an unlisted subdomain.
2. Zero Trust → Access → Applications: protect that hostname with a policy allowing only your staff emails + their IdP's MFA.
3. Keep Supabase MFA on as the second, independent wall.
