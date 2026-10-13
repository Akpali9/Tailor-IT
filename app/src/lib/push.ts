import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";
import { isNative, platform } from "./native";

let currentToken: string | null = null;
let listenersAttached = false;

/** Asks for permission (once) and registers this device's FCM/APNs token for the signed-in user. */
export async function registerPush(userId: string, onTap: (data: Record<string, string>) => void) {
  if (!isNative) return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    if (!listenersAttached) {
      listenersAttached = true;
      await PushNotifications.addListener("registration", async ({ value }) => {
        currentToken = value;
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        await supabase.from("device_tokens").upsert({ user_id: data.user.id, token: value, platform, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
      });
      await PushNotifications.addListener("registrationError", (e) => console.warn("push registration error", e));
      await PushNotifications.addListener("pushNotificationActionPerformed", (a) => onTap((a.notification.data ?? {}) as Record<string, string>));
      if (platform === "android") await PushNotifications.createChannel({ id: "default", name: "Tailor IT", description: "Orders, payments and updates", importance: 4, visibility: 1 });
    }
    await PushNotifications.register();
  } catch (e) {
    console.warn("push setup failed", userId, e);
  }
}

export async function unregisterPush() {
  if (!isNative || !currentToken) return;
  await supabase.from("device_tokens").delete().eq("token", currentToken);
  currentToken = null;
  try { await PushNotifications.removeAllListeners(); listenersAttached = false; } catch { /* ignore */ }
}
