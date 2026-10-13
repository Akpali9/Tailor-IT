import type { CapacitorConfig } from "@capacitor/cli";

// IMPORTANT: change appId to a reverse-domain you own BEFORE the first store upload —
// it can never be changed afterwards.
const config: CapacitorConfig = {
  appId: "app.tailorit.mobile",
  appName: "Tailor IT",
  webDir: "dist",
  backgroundColor: "#f6f3ed",
  server: { androidScheme: "https" },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: "#f6f3ed", androidScaleType: "CENTER_CROP", showSpinner: false },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    Keyboard: { resize: "body", resizeOnFullScreen: true },
  },
};
export default config;
