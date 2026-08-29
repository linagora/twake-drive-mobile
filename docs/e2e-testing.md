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
- The suite does **not** sign in for you. Log in once, then run the flows.

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

| Flow                 | What it checks                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| `01-launch-browse`   | The app launches and the drive lists folders                               |
| `02-tabs`            | The bottom tabs (Drive / Favoris / Récents / Partages / Corbeille) switch  |
| `03-search`          | Disabled (tag `skip`): /search has no UI entry point — see the flow header |
| `04-folder-crud`     | A real create + delete round-trip, strictly scoped to a throwaway folder   |
| `05-preview`         | File preview (⚠️ environment-dependent — not validated on every build)     |
| `06-editor`          | A document editor opens                                                    |
| `07-offline-pin`     | Pin a folder for offline and verify the menu state                         |
| `08-share-internal`  | The share sheet opens for a folder (non-mutating)                          |
| `09-favorite-toggle` | Favourite → present in Favoris → un-favourite → absent from Favoris        |
| `12-offline-toggle`  | Pin → the menu shows "Remove from offline" → unpin                         |

Shared **subflows** live in `flows/subflows/`: `openDrive` (launch + assert logged
in), `assertLoggedIn`, and `cleanup`.

## Writing flows — selector recipe

Cross-platform selectors are the tricky part. What works on both platforms:

- **Tabs & folders** — match by text **regex** so accessibility-label differences
  don't matter: `{ text: 'Récents.*' }` matches iOS "Récents, tab, 3 of 7" and
  Android "Récents".
- **Buttons** — prefer stable **testIDs**: `drive-fab`, `appbar-back-button`,
  `confirm-delete-submit`, `selection-delete`.
- **Per-row folder menu** — target the row's own action button by testID:
  `folder-actions:<folder name>`. On **iOS** the react-native-paper Menu wraps it,
  so the addressable id is `folder-actions:<name>-container-outer-layer`.
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

## CI

The iOS File Provider unit tests (37) run in CI on the simulator
(`.github/workflows/test-ios.yml`, path-gated to `ios/**`). The Maestro flows are
currently run locally against a device or simulator; wiring them into CI with a
pre-authenticated build is a follow-up.
