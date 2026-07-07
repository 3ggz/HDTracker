# HDTracker Mobile (iOS + Android)

Native shells built with [Capacitor](https://capacitorjs.com) in **remote mode**:
the app is a thin WebView that loads the production deployment directly. There is
no bundled frontend — every web deploy to Vercel updates both apps instantly with
no store re-release. The only locally bundled page is `mobile/www/index.html`, an
offline fallback.

## Before the first build — verify the server URL

`capacitor.config.ts` → `server.url` is set to:

```
https://hdtracker.vercel.app
```

**If the production site lives at a different domain, change it there first**, then:

```bash
npm install
npx cap sync
```

(`cap sync` copies config + the fallback page into both native projects. Run it
again any time `capacitor.config.ts` changes.)

## iOS (needs a Mac with Xcode 15+)

```bash
npm install
npx cap sync ios
npx cap open ios        # opens ios/App in Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → pick your Apple
   Developer team. Bundle id is `systems.hdsecurity.hdtracker` (change it here
   if the team's provisioning uses a different prefix).
2. Pick a device / "Any iOS Device" and **Product → Archive**.
3. **Distribute App**:
   - **TestFlight (internal)** is the easiest path for a small crew — up to 100
     internal testers, no App Review for internal groups.
   - App Store public release is possible but Apple can be picky about
     WebView-wrapper apps (guideline 4.2); for an internal tool, TestFlight or
     **Unlisted App Distribution** is the intended route.

App icon: replace the placeholder set in
`ios/App/App/Assets.xcassets/AppIcon.appiconset/` (one 1024×1024 PNG is enough —
Xcode 15 generates the rest).

## Android (Mac, Windows, or Linux with Android Studio)

```bash
npm install
npx cap sync android
npx cap open android    # opens android/ in Android Studio
```

In Android Studio:

1. Let Gradle sync finish.
2. **Build → Generate Signed Bundle / APK**.
   - **APK** + "send the file to everyone's phone" is the zero-friction option
     for an internal crew (enable "Install unknown apps" once per device).
   - **AAB** + Play Console **internal testing track** if you'd rather
     distribute through the Play Store.
3. First time only: create a keystore when prompted and **back it up** — losing
   it means users must uninstall/reinstall for future updates.

App icon: replace `android/app/src/main/res/mipmap-*/ic_launcher*.png`
(Android Studio: right-click `res` → New → Image Asset does all densities).

## Day-to-day

| Task | Command |
| --- | --- |
| Changed `capacitor.config.ts` | `npm run cap:sync` |
| Open iOS project | `npm run cap:ios` |
| Open Android project | `npm run cap:android` |
| Ship an app update | just deploy to Vercel — the shells load the live site |

A store re-release is only needed when the **native** layer changes: server URL,
app icon/name, Capacitor version, or new native plugins.

## Notes

- Auth: Supabase cookie sessions work as-is inside the WebView — the shell
  behaves like a dedicated browser for the site.
- Camera/photo uploads use the standard web file input, which iOS/Android route
  to the native camera/library picker automatically. No plugin needed.
- The `@capacitor/app` plugin is included so the Android hardware back button
  navigates WebView history instead of exiting the app.
