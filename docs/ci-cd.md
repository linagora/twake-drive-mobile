# CI / CD — Mobile builds

GitHub Actions build **unsigned dev/test artifacts** with no secrets. Signing
and store distribution are documented below as a phase-2 activation guide.

## Current status (introduced 2026-07-02)

All checks are **non-blocking** (`continue-on-error`) because the app source and
its dependencies aren't yet clean. Snapshot at introduction:

- **Dependencies (fixed):** the committed `package-lock.json` was corrupt
  (`lockfileVersion 2`, unparseable by npm's arborist), so every clean `npm ci`
  failed — in CI, Docker, and fresh clones. Regenerated as a valid
  `lockfileVersion 3` lock, and added `.npmrc` (`legacy-peer-deps=true`) for
  this stack's React-19 peer conflicts. `npm ci` now works.
- **lint** — 293 errors: ~275 auto-fixable `prettier/prettier`, plus 18
  `@typescript-eslint/no-explicit-any` "rule not found". Root cause:
  `.eslintrc.js` never registers the `@typescript-eslint` plugin (it *is*
  installed under `node_modules/`). Fix: add the plugin to the ESLint config,
  then `npm run lint -- --fix` for the formatting.
- **typecheck** — expo typed-routes reject `"/(drive)/files"`; and `scope` is
  not in cozy-client's `ClientOptions` type (surfaced by the scoped-OAuth work).
- **test** — 9 of 356 failing (4 suites, incl. `src/auth/useAuth.test.tsx`).
- **security (Trivy)** — non-blocking; found `shell-quote` 1.8.3
  (CVE-2026-9277, **CRITICAL** RCE → fixed in 1.8.4), `undici` 6.25.0
  (CVE-2026-12151, HIGH → 6.27.0+), and `ws` (CVE-2026-48779, HIGH). All
  transitive — resolve via an npm `overrides` block in `package.json`, then
  remove `continue-on-error` from `security.yml`.

Flip each job to blocking (remove its `continue-on-error`) once it is green.

## Workflows (phase 1)

| Workflow | Triggers | Output |
| --- | --- | --- |
| `ci.yml` | PR, push `main`, manual | `lint` · `typecheck` · `test` checks |
| `build-android.yml` | PR, push `main`, tags `v*`, manual | Installable `app-release.apk` artifact + PR comment |
| `build-ios.yml` | push `main`, tags `v*`, manual | iOS **Simulator** `.app` artifact |
| `security.yml` | PR, push `main` | Trivy dependency scan (CRITICAL/HIGH) |

`build-ios.yml` skips PRs on purpose (macOS runner minutes cost ~10x). Trigger
it manually from the **Actions** tab (**Run workflow**) or by pushing a `v*` tag.

## Getting a test build

Open the workflow run in the **Actions** tab → **Artifacts** → download.

- **Android** (`twake-drive-android-apk-<run>`): installs on any device.
  ```bash
  adb install app-release.apk
  ```
  Or copy to the device and allow "install from unknown sources". The APK is
  signed with the debug key — fine for testing, not for the Play Store.
- **iOS** (`twake-drive-ios-simulator-<run>`): unzip, then run in the iOS
  Simulator (no physical-device install without signing — see phase 2).
  ```bash
  unzip TwakeDrive-Simulator.app.zip
  xcrun simctl boot "iPhone 16"        # if no Simulator is booted
  xcrun simctl install booted TwakeDrive.app
  xcrun simctl launch booted com.linagora.twakedrive
  ```

## Why iOS is Simulator-only here

Installing on a physical iPhone requires an Apple signing identity and a
provisioning profile. That's phase 2 (TestFlight via Fastlane `match`).

---

## Phase 2 — activation guide (signing + stores)

Ported from the visio-mobile CI. Each section lists the exact secrets to add
under **Settings → Secrets and variables → Actions**, then the workflow change.

### Android release signing + Google Play (internal track)

1. Generate an upload keystore (once):
   ```bash
   keytool -genkeypair -v -keystore upload.keystore -alias twakedrive \
     -keyalg RSA -keysize 2048 -validity 10000
   base64 -i upload.keystore | pbcopy   # paste into ANDROID_KEYSTORE_BASE64
   ```
2. Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. Add a real `release` `signingConfig` to `android/app/build.gradle` reading
   those from the environment (fall back to `signingConfigs.debug` when unset,
   so local dev keeps working), and set `versionCode` from
   `System.getenv("VERSION_CODE") ?: 1`.
4. Play upload: create a Google Play service account with the *Release manager*
   role, add `PLAY_SERVICE_ACCOUNT_JSON`, and use Fastlane `supply`
   (`track: internal`) after `bundleRelease`. (WIF is a later hardening; start
   with the JSON key.)

### iOS signing + TestFlight

1. Apple Developer + App Store Connect (you have these). Create an ASC API key
   (**Users and Access → Keys**).
2. Create a **private** git repo for `fastlane match` certificates.
3. Secrets: `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
   `APP_STORE_CONNECT_API_KEY_CONTENT` (base64), `APPLE_TEAM_ID`,
   `MATCH_GIT_URL`, `MATCH_PASSWORD`, `MATCH_DEPLOY_KEY` (SSH key for the match
   repo).
4. Fastlane `distribute` lane: `match(type: "appstore")` → `gym(workspace:
   "TwakeDrive.xcworkspace", scheme: "TwakeDrive", export_method: "app-store")`
   → `pilot` (TestFlight). Note the **workspace** (CocoaPods), not a bare
   `.xcodeproj`.

### Other visio-mobile pieces (optional)

- **GitGuardian** secret scan — add `GITGUARDIAN_API_KEY`, add a
  `GitGuardian/ggshield-action` job to `security.yml`.
- **SonarCloud** — add `SONAR_TOKEN` + a `sonar-project.properties`
  (org + projectKey), add a scan workflow.
- **SLSA build provenance** — `actions/attest-build-provenance` on the built
  IPA/AAB (`id-token: write` + `attestations: write`, no secret).
- **Promote Android** — a manual workflow calling Fastlane
  `supply(track_promote_to: "production")`.

## Secrets matrix (phase 2)

| Secret | Used by |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` / `_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Android release signing |
| `PLAY_SERVICE_ACCOUNT_JSON` | Fastlane `supply` → Play |
| `APP_STORE_CONNECT_API_KEY_ID` / `_ISSUER_ID` / `_API_KEY_CONTENT` | ASC / TestFlight |
| `APPLE_TEAM_ID` | iOS signing |
| `MATCH_GIT_URL` / `MATCH_PASSWORD` / `MATCH_DEPLOY_KEY` | Fastlane `match` |
| `GITGUARDIAN_API_KEY` | GitGuardian scan |
| `SONAR_TOKEN` | SonarCloud |
