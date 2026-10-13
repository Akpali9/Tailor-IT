// Creates (or promotes) an admin account. The account must enrol an authenticator app at first sign-in;
// without MFA (aal2) the database refuses every admin action.
//   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='long-random-password' SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node create-admin.mjs
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) { console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD"); process.exit(1); }
if (password.length < 14) { console.error("Use an admin password of at least 14 characters."); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });
let id;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Tailor IT Admin" } });
if (created.error) {
  if (!/already/i.test(created.error.message)) throw created.error;
  for (let page = 1; page < 50 && !id; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    id = data?.users.find((u) => u.email === email)?.id;
    if (!data?.users.length) break;
  }
  if (!id) throw new Error("User exists but could not be located");
  await admin.auth.admin.updateUserById(id, { password });
} else id = created.data.user.id;
const { error } = await admin.from("admins").upsert({ user_id: id });
if (error) throw error;
console.log(`Admin ready: ${email}. Sign in to the console and scan the QR code to enrol MFA.`);
