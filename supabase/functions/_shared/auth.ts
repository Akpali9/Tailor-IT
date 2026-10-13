import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { env, HttpError } from "./http.ts";

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export function userClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
}

export interface Ctx {
  user: User;
  /** Client acting AS the user (RLS applies). */
  db: SupabaseClient;
  /** Service-role client. Use only after authorisation checks. */
  admin: SupabaseClient;
  role: "client" | "designer";
}

export async function requireUser(req: Request, role?: "client" | "designer"): Promise<Ctx> {
  if (!req.headers.get("Authorization")) throw new HttpError(401, "unauthorized");
  const db = userClient(req);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", data.user.id).single();
  if (!profile || profile.status !== "active") throw new HttpError(403, "account_inactive");
  if (role && profile.role !== role) throw new HttpError(403, "wrong_role");
  return { user: data.user, db, admin, role: profile.role };
}

/** Admin = row in public.admins AND an MFA-verified session (checked in SQL by is_admin()). */
export async function requireAdmin(req: Request): Promise<{ user: User; db: SupabaseClient; admin: SupabaseClient }> {
  if (!req.headers.get("Authorization")) throw new HttpError(401, "unauthorized");
  const db = userClient(req);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  const { data: ok } = await db.rpc("is_admin");
  if (ok !== true) throw new HttpError(403, "forbidden");
  return { user: data.user, db, admin: adminClient() };
}

export async function consumeQuota(ctx: Pick<Ctx, "admin" | "user">, kind: string) {
  const { data, error } = await ctx.admin.rpc("consume_ai_quota", { p_user: ctx.user.id, p_kind: kind });
  if (error) throw new HttpError(500, "quota_error", error.message);
  if (data !== true) throw new HttpError(429, "daily_limit_reached", "You have reached today's limit for this feature.");
}

export async function releaseQuota(ctx: Pick<Ctx, "admin" | "user">, kind: string) {
  await ctx.admin.rpc("release_ai_quota", { p_user: ctx.user.id, p_kind: kind });
}
