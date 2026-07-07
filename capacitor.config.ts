import type { CapacitorConfig } from "@capacitor/cli";

// HDTracker is a server-rendered Next.js app (auth, server actions,
// dynamic routes), so the native shells run in Capacitor's remote
// mode: the WebView loads the production deployment directly. No
// static export, no bundle-the-frontend step — shipping a web fix
// via Vercel updates the apps instantly with no store re-release.
//
// !!! Verify server.url matches the real production domain before
// building. If the Vercel project uses a different URL, change it
// here and run `npx cap sync`.
const config: CapacitorConfig = {
  appId: "systems.hdsecurity.hdtracker",
  appName: "HDTracker",
  // webDir is required by the CLI even in remote mode. mobile/www
  // holds a static offline-fallback page only.
  webDir: "mobile/www",
  server: {
    url: "https://hdtracker.vercel.app",
    // Deep control stays with the deployed site; nothing is served
    // from the local bundle except the offline fallback.
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
