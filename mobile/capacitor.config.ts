import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "au.com.maximuseducation.crm",
  appName: "Maximus CRM",
  webDir: "dist",
  // Production code is bundled in the app; no remote server.url or navigation wildcard.
  server: { androidScheme: "https", iosScheme: "capacitor" },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: "automatic", preferredContentMode: "mobile", webContentsDebuggingEnabled: false },
  plugins: {
    CapacitorHttp: { enabled: true },
    SplashScreen: { launchAutoHide: false, backgroundColor: "#12384e", showSpinner: false },
  },
};
export default config;
