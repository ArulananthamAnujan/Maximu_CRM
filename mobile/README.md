# Maximus CRM for Android and iPhone

This is a Capacitor application with the existing CRM React interface bundled inside the app. It talks to the existing HTTPS CRM API. It is not an app-store submission and is not certified ready for production until the device and account checks below are completed.

## Implemented

- Shared staff/admin/client screens, backend permissions, search, case files, notes, messages, documents, finance and Copilot UI.
- Native bottom navigation and in-app case expansion; Android back closes the current panel before returning home.
- Local icons and launch artwork rendered from the existing Maximus emblem.
- Native HTTP transport for existing HttpOnly login and refresh cookies, including multipart uploads.
- Password sign-in without navigating the local bundle to a remote Gmail page.
- Google login in the system browser using PKCE and the existing CRM profile validation endpoint.
- Google Workspace consent in the system browser, with a check that the browser profile matches the app profile. If the browser is not signed in, the person signs in there once. Previously connected mailboxes are reused by the existing API.
- Camera document capture, native file picker, native save/share sheets, temporary sharing-file cleanup, network status, and tab haptics.
- No offline write queue: the CRM must confirm every saved operation. Push notifications are not implemented in this release; existing in-app notifications remain available.

## Build

Use Node 22.13 or later. Install both dependency sets from the repository root:

```bash
npm ci --ignore-scripts
npm --prefix mobile ci --ignore-scripts
npm --prefix mobile run build
npm --prefix mobile test
npm --prefix mobile run sync
```

Open the native projects with `npm --prefix mobile run android` or `npm --prefix mobile run ios`. Android requires the SDK and JDK 21. iPhone builds require macOS and the Xcode version supported by Capacitor 8.5. The GitHub Actions **Mobile apps** workflow builds a debug Android APK, an **unsigned** Android App Bundle, and an iPhone **simulator** app. These are not signed store releases.

`npm --prefix mobile run dev` previews the bundled UI locally. The dev API proxy points at the CRM and uses your own sign-in. Browser tests mock all CRM requests and never create production records. Run `npm --prefix mobile run test:ui` after installing Playwright Chromium.

## Backend and OAuth setup before device testing

1. Deploy the shared changes in this branch, including `/api/mobile/config` and `/mobile/workspace`, to the same CRM origin. Password and existing CRM API calls remain unchanged.
2. In Supabase Authentication → URL Configuration, allow the **exact** redirect `au.com.maximuseducation.crm://auth/callback`. Retain the existing website redirect URLs. This native flow uses the existing enabled Google provider.
3. The app's API origin is fixed in `src/policy.ts`. If the CRM moves to another domain, update it, `vite.config.ts`, the HTML CSP, OAuth settings, and store links together. No service-role key, Google secret, signing key or client dataset belongs in the app.
4. The bundle ID/package name is provisionally `au.com.maximuseducation.crm`. Confirm ownership/availability in both developer accounts before the first signed release; changing it later creates a different store app.

## Required device acceptance checks

Run on physical Android and iPhone devices using non-sensitive test records, and record the outcome before submission:

- Password and Google sign-in; cancelled/expired OAuth; failed/deactivated account; relaunch; expired session refresh; logout followed by a different user. Verify native cookie persistence, deletion and isolation on each OS.
- Super Admin sees the permitted organisation; staff/admin see only their allowed cases; client sees only their own portal. Compare to the web app.
- Search and open a case, save a note, move a stage, back out, and reopen the same record. Verify data and attribution on the website.
- Camera allow/deny/cancel, file selection, upload an image and PDF, download/share and cancel sharing, including filenames and multiple files.
- Gmail and Calendar reconnect with matching and mismatched browser accounts; return to app; receive/send a test email and attachment. Send only to an explicitly authorised test recipient.
- Copilot generation/cancellation and copy/save actions with a configured provider; notifications; keyboard, safe areas, rotation and readable card layouts on small phones and tablets.
- Network loss during fetch/upload/save, resumption and duplicate-submit prevention. No disconnected operation should claim it was saved.
- Confirm permission prompts, app icon, launch screen, VoiceOver/TalkBack, font scaling and absence of horizontal page scrolling.

## Store release inputs still required

- Apple Developer and App Store Connect organisation access, team ID, signing certificate/provisioning, app record and TestFlight testers.
- Google Play Console organisation access, app record, upload key/Play App Signing and test track. Release signing reads `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` from a private build environment; never commit these. `MOBILE_BUILD_NUMBER` controls the increasing Android version code.
- Owner-approved privacy-policy and support URLs, support contact, account-deletion/retention process where applicable, age/content ratings, and accurate Apple privacy/Google Data safety declarations covering actual CRM data and integrations. The included Apple privacy manifest declares the file timestamp API reason only; it is not the complete store privacy disclosure.
- A reviewer account with non-sensitive data and instructions for the roles/workflows. Screenshots must come from the tested signed release.
- A complete release test pass and store review. Store acceptance is not guaranteed by using Capacitor or by a successful web build.

See [Capacitor deployment](https://capacitorjs.com/docs/deployment), [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Apple review requirements](https://developer.apple.com/app-store/review/guidelines/) and [Google Play setup](https://support.google.com/googleplay/android-developer/answer/9859152).
