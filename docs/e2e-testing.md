# End-to-end testing (Maestro)

Twake Drive Mobile's end-to-end smoke suite runs with
[Maestro](https://maestro.mobile.dev/) — one YAML flow language that drives **both**
a real Android device and the iOS simulator. The flows are intentionally
lightweight ("smoke") and assume an **already-authenticated** app.

## Why Maestro

- One flow language for iOS **and** Android — selectors differ in only a few places.
- Drives the iOS 26 simulator out of the box, where `idb` (deprecated) and
  AppleScript / `cliclick` (blocked without an Accessibility grant) do not.
- Resilient waits (`extendedWaitUntil`, `waitForAnimationToEnd`) instead of sleeps.

## Prerequisites

- **Install Maestro:** `curl -Ls https://get.maestro.mobile.dev | bash` — this adds
  `~/.maestro/bin/maestro` to your `PATH`.
- **A logged-in app** on the target:
  - **Android** — a device/emulator with the app installed and authenticated
    (`adb devices` lists it).
  - **iOS** — a booted simulator with the app installed and authenticated.
- Either log in once by hand, or let the run sign into the local e2e stack
  (below).

### Signing in automatically on the iOS simulator

`00-login-instance.yaml` signs a development build into a local stack, the way
the Android workflow does on CI.

```bash
cd e2e/stack
# Apple Silicon: the image's bundled CouchDB crashes under emulation, so add
# the override, which runs a native CouchDB next to it.
docker compose -f docker-compose.yml -f docker-compose.arm64.yml up -d
./setup.sh 127.0.0.1 cozycozy
cd ../..
npm run e2e:ios
```

The instance is named `127.0.0.1` on purpose: iOS only lets an app speak plain
HTTP to IP addresses, `.local` and dot-less names, and cozy-stack cannot serve
an instance whose domain has no dot (`localhost` panics on the authorize page).
The flow clears the app's state first, so the simulator loses whatever session
it had. `INSTANCE_DOMAIN` names another instance; the address is passed with `-e`: Maestro does not let it
override a value a flow declares itself.

## Running

```bash
cd e2e/maestro

# All in-app flows (single connected target)
maestro test flows/in-app/

# A single flow
maestro test flows/in-app/09-favorite-toggle.yaml

# Choose a platform when BOTH a device and a simulator are connected
maestro --platform ios     test flows/in-app/09-favorite-toggle.yaml
maestro --platform android test flows/in-app/09-favorite-toggle.yaml
```

On failure, debug artifacts (screenshots + view hierarchy) land in
`~/.maestro/tests/<timestamp>/` — the screenshot is usually enough to see what
happened.

## Flows

Each in-app flow opens the drive via the `openDrive` subflow (which asserts the
logged-in state) and then exercises one area:

| Flow                       | What it checks                                                                |
| -------------------------- | ----------------------------------------------------------------------------- |
| `01-launch-browse`         | The app launches and the drive lists folders                                  |
| `02-tabs`                  | The bottom tabs (Drive / Favoris / Récents / Partages / Corbeille) switch     |
| `03-search`                | Opens the search from the app bar and finds a seeded file by part of its name |
| `04-folder-crud`           | A real create + delete round-trip, strictly scoped to a throwaway folder      |
| `05-preview`               | File preview (⚠️ environment-dependent — not validated on every build)        |
| `06-editor`                | A document editor opens                                                       |
| `07-offline-pin`           | Pin a folder for offline and verify the menu state                            |
| `08-share-internal`        | The share sheet opens for a folder (non-mutating)                             |
| `09-favorite-toggle`       | Favourite → present in Favoris → un-favourite → absent from Favoris           |
| `12-offline-toggle`        | Pin → the menu shows "Remove from offline" → unpin                            |
| `17-empty-folder-refresh`  | An empty folder keeps its empty state while the list refetches                |
| `16-share-recipient`       | Adds a recipient by email, checks the row, revokes it, deletes the folder     |
| `21-new-share-badge`       | A received share badges Partages, is listed under "with me", opens, unbadges  |
| `22-logout-asks-to-erase`  | The avatar's logout asks; a plain one keeps a pin, an erasing one drops it    |
| `23-offline-after-relogin` | Signed out and back in without a restart, a pinned folder still downloads     |
| `24-audio-replay`          | A track played to its end plays again from the start on Play                  |

Shared **subflows** live in `e2e/maestro/subflows/`: `openDrive` (launch + assert logged
in), `assertLoggedIn`, `signInInstance` (from the welcome screen to the drive,
without clearing the app), and `cleanup`.

## Writing flows — selector recipe

Cross-platform selectors are the tricky part. What works on both platforms:

- **Anything the app draws** — a **testID**, never a label: `tab-files`,
  `drive-fab`, `folder-row:<name>`, `file-row:<name>`, `folder-actions:<name>`,
  `action-unpin`. The same id works on both platforms. On iOS a file row reads
  as "name, size · date", so its name alone never matches as text.
- **Create menu entries** — react-native-paper names them `create-folder` on
  Android and `create-folder-container-outer-layer` on iOS: select with
  `create-folder(-container-outer-layer)?`.
- **⚠️ Never use `rightOf` / positional selectors for a row menu.** A positional tap
  once deleted the wrong (real) folders. Always target the row by name.

## Gotchas

- **`pressKey: Enter` does not submit** the "New folder" dialog — tap the confirm
  button instead (creating a folder purely with `Enter` fails).
- **`-e KEY=VALUE` is ignored** when the flow declares an `env:` block (the block
  wins) — hardcode the value in a throwaway copy when you need to override it.
- **Two targets connected** → always pass `--platform`, or Maestro picks one
  arbitrarily.
- On large-screen devices (e.g. Pixel Fold) Maestro's coordinates can drift —
  confirm with the failure screenshot rather than trusting a single assertion.

## Feature flags on the disposable stack

`e2e/stack/setup.sh` sets the same flag map twake-drive's own e2e run provisions
its instances with (`e2e/helpers/flags.ts` there), so both clients are exercised
against the same instance. `drive.shared-drive.enabled` and
`drive.federated-shared-folder.enabled` are the two the app reads to share by
email through a shared drive rather than a cozy-to-cozy sharing.

## CI

The iOS File Provider unit tests (37) run in CI on the simulator
(`.github/workflows/test-ios.yml`, path-gated to `ios/**`). The Maestro flows are
currently run locally against a device or simulator; wiring them into CI with a
pre-authenticated build is a follow-up.
