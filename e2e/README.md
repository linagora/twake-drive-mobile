# Maestro E2E suite — Twake Drive

**Cross-platform** E2E smoke tests (Android device + iOS simulator), run locally
before a signed build. Driven by [Maestro](https://maestro.mobile.dev/).

## Installation

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash   # installs ~/.maestro/bin/maestro
export PATH="$PATH:$HOME/.maestro/bin"
```

Android: `adb` + a connected device. iOS: Xcode + a booted simulator.

## Setup (once)

The flows assume a **pre-authenticated session** (the OIDC login + email code is not
automated — see `flows/00-login.yaml`, excluded from runs).

1. Launch the app and log in by hand (device / simulator).
2. iOS simulator: install a build **with the keychain fallback fix** (otherwise SecureStore
   fails on an unsigned build — see DEVICE-NOTES). Build: `gh workflow run build-ios.yml`.
3. The flows seed what they act on through the stack, so they run against the e2e
   stack (`e2e/stack`), not a personal account. See "Independent flows" below.

## Run

```bash
npm run e2e:ios       # iOS simulator (in-app flows)
npm run e2e:android   # Android device (in-app + cross-app File Provider/Share)
# a targeted flow (always target the platform if 2 devices are connected):
maestro --platform ios test e2e/maestro/flows/in-app/02-tabs.yaml
```

## Independent flows

Every flow can run alone and in any order:

- It starts with `subflows/openDrive.yaml`: network back on, cold start, signed in.
- It creates its own material through the stack API (`maestro/scripts/seed.js`), under
  a random name, and reads it back as `${output.<key>.name}`.
- Its `onFlowComplete` runs `subflows/cleanup.yaml`, which turns airplane mode off and
  deletes that material, whether the flow passed or not.
- Only the sign-in (`00-login-instance`) is shared, and it runs first.

`05-preview` reads the `sample.jpg` the instance is created with and changes nothing.
`06-editor` is tagged `onlyoffice`: the e2e stack has no OnlyOffice server.

CI (`.github/workflows/e2e-android.yml`) runs `scripts/run-flows.sh` on every pull
request: one `maestro test` per flow, in a shuffled order printed as a seed in the job
summary. Replay an order with the `seed` input of a manual dispatch, or locally:

```bash
E2E_SEED=1234 ./e2e/scripts/run-android.sh e2e/maestro/flows/in-app/11-move.yaml
```

`20-logout-closes-sso` and `22-logout-asks-to-erase` sign out, then sign back in for
the flows after them. They need the stand-in portal of `e2e/stack` (`portal.js`, port 8090) and the `signup.url` flag `setup.sh` points to it. On an iOS simulator, run `setup.sh` with
`PORTAL_URL=http://127.0.0.1:8090`.

To sign back in without clearing the app, so as to check what the device kept, run
`subflows/signInInstance.yaml` from the welcome screen: the instance screen remembers
the last address, and the subflow only types it when the field is empty. Once signed in
this way, the login's browser is still in the Android task under the app: a back the
app does not handle brings it to the front, one more reason to stay off `pressKey: Back`.

## Device selection (gotcha)

With **two devices connected**, `maestro test` auto-selects one (often the Android one).
**Always** `--platform ios|android` or `--udid <UDID>`. The run-scripts do this.

## Cross-platform selectors

Labels/accessibility differ iOS↔Android. Rules (details in `DEVICE-NOTES.md`):

- Anything the app draws: a **testID** (`tab-files`, `drive-fab`, `action-unpin`,
  `folder-row:<name>`, `pinned-badge:downloaded`…), never a label: labels change with the
  language, testIDs do not, so the flows run in any language. A state the flow checks
  goes into the testID (`action-pin` / `action-unpin`).
- Text only for what the app does not draw (the stack's login page, DocumentsUI, Files)
  and for the names of the files a flow seeded.
- Back: `{ id: 'appbar-back-button' }` (no `pressKey: Back` — iOS has no hardware back).

## Structure

```
e2e/
  maestro/
    config.yaml           # excludes login and disposable from runs
    subflows/             # assertLoggedIn, openDrive, signInInstance, cleanup
    flows/
      00-login.yaml       # login tag (semi-manual, excluded)
      00-welcome.yaml     # preauth tag (app boot + login form)
      in-app/             # inapp tags (iOS + Android): 01-22
      android/            # android tags: 10 File Provider, 11 Share
    scripts/              # seed.js, seedReceivedShare.js, cleanup.js (stack API, run by the flows)
  scripts/                # run-android.sh, run-ios.sh, run-flows.sh
  fixtures/               # sample.jpg (share)
  DEVICE-NOTES.md         # device results + recipe + quirks
```

## Disposable-only flows

A flow tagged `disposable` mutates state it cannot undo through the UI, so
`config.yaml` excludes it from local runs; CI runs it, its instance is thrown away. `19-create-in-shared-drive` is one:
sharing a folder by email turns it into a shared drive, and no row in the
Partages list carries an action menu, so the share can no longer be revoked
nor the folder deleted from the app.

`21-new-share-badge` is another. It needs a share received from someone else,
and gets one from `maestro/scripts/seedReceivedShare.js`, which sends the
instance the request an owner's stack announces a share with, so no second
instance is involved. The cleanup deletes the shortcut; the pending sharing
behind it stays.

Run those against the throwaway instance from `e2e/stack` only:

```bash
./e2e/scripts/maestro.sh test e2e/maestro/flows/in-app/19-create-in-shared-drive.yaml
```

## Android emulator: the login flow cannot finish locally

`flows/00-login-instance.yaml` is green in CI but stalls on a local emulator that
ships Chrome. After the authorize page, the stack redirects to
`https://links.twake.app/drive?code=...`, and Chrome loads that URL instead of
handing it to the app, even though the domain is verified:

```bash
adb shell pm get-app-links com.linagora.twakedrive   # links.twake.app: verified
```

The CI emulator runs an AOSP image with no Chrome at all, which is why it never
hits this. Re-sending the redirect with `am start` does not help either: the app
task is only brought to the front and the VIEW intent is never delivered.

To finish the login by hand, against the throwaway instance only:

1. Read the pending authorize URL, which carries the client id, the state and
   the PKCE challenge:
   `adb shell dumpsys activity activities | grep -o "dat=http[^ }]*"`
2. Add `twakedrive://` to that client's `redirect_uris` in CouchDB, under
   `<instance-prefix>/io-cozy-oauth-clients`.
3. Reopen the authorize URL with `redirect_uri=twakedrive%3A%2F%2F` and tap
   Authorize. Chrome hands a custom scheme to the app, and the token exchange
   still succeeds.

Step 2 widens what the registered OAuth client accepts as a redirect, so keep it
to an instance from `e2e/stack`.
