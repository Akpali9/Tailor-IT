import { env, b64encode } from "./http.ts";

interface ServiceAccount { project_id: string; client_email: string; private_key: string }
let cached: { token: string; exp: number } | null = null;

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return b64encode(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cached.token;
}

export interface PushMessage { title: string; body: string; data?: Record<string, string> }
export interface PushResult { sent: number; invalidTokens: string[] }

/** Sends to many device tokens (FCM HTTP v1 has no multicast, so we fan out with bounded concurrency). */
export async function sendPush(tokens: string[], msg: PushMessage): Promise<PushResult> {
  const raw = env("FCM_SERVICE_ACCOUNT_JSON", true);
  if (!raw || tokens.length === 0) return { sent: 0, invalidTokens: [] };
  const sa = JSON.parse(raw) as ServiceAccount;
  const bearer = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const invalid: string[] = [];
  let sent = 0;
  const queue = [...tokens];
  const worker = async () => {
    while (queue.length) {
      const token = queue.pop()!;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ message: {
          token, notification: { title: msg.title, body: msg.body }, data: msg.data ?? {},
          android: { priority: "HIGH", notification: { channel_id: "default" } },
          apns: { payload: { aps: { sound: "default" } } },
        } }),
      });
      if (res.ok) { sent++; continue; }
      const text = await res.text();
      if (res.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) invalid.push(token);
      else console.error("FCM send failed", res.status, text);
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, tokens.length) }, worker));
  return { sent, invalidTokens: invalid };
}
