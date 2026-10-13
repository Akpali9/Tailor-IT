import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { PrivacyScreen } from "@capacitor/privacy-screen";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as "ios" | "android" | "web";

export async function initNative() {
  if (!isNative) return;
  try { await StatusBar.setStyle({ style: Style.Light }); } catch { /* not supported on this device */ }
  try { await SplashScreen.hide({ fadeOutDuration: 250 }); } catch { /* ignore */ }
}

/** Opens http(s) links in the in-app browser (SFSafariViewController / Custom Tabs). */
export async function openUrl(url: string) {
  if (!/^https:\/\//.test(url)) return;
  if (isNative) await Browser.open({ url, presentationStyle: "popover" });
  else window.open(url, "_blank", "noopener,noreferrer");
}
export const closeBrowser = () => (isNative ? Browser.close().catch(() => undefined) : Promise.resolve());

export async function haptic(style: "light" | "medium" = "light") {
  if (!isNative) return;
  try { await Haptics.impact({ style: style === "light" ? ImpactStyle.Light : ImpactStyle.Medium }); } catch { /* ignore */ }
}

export async function shareLink(opts: { title: string; text: string; url?: string }) {
  try {
    if (isNative || (navigator.share && window.isSecureContext)) {
      if (isNative) await Share.share({ ...opts, dialogTitle: opts.title });
      else await navigator.share(opts);
      return true;
    }
    await navigator.clipboard.writeText(`${opts.text} ${opts.url ?? ""}`.trim());
    return "copied" as const;
  } catch { return false; }
}

/** Blocks screenshots / screen recording on Android and blurs the app switcher preview on iOS. */
export async function setPrivacyShield(enabled: boolean) {
  if (!isNative) return;
  try {
    if (enabled) await PrivacyScreen.enable({ android: { preventScreenshots: true, privacyModeOnActivityHidden: "dim" }, ios: { blurEffect: "dark" } });
    else await PrivacyScreen.disable();
  } catch { /* plugin unavailable */ }
}

/** Camera / gallery on device; file picker in the browser. Resolves null if the user cancels. */
export async function pickPhoto(): Promise<Blob | null> {
  if (isNative) {
    try {
      const photo = await Camera.getPhoto({ source: CameraSource.Prompt, resultType: CameraResultType.Uri, quality: 90, correctOrientation: true, promptLabelHeader: "Add your photo", promptLabelPhoto: "Choose from library", promptLabelPicture: "Take a photo" });
      if (!photo.webPath) return null;
      return await (await fetch(photo.webPath)).blob();
    } catch { return null; }
  }
  return await new Promise<Blob | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
