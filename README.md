# Twake Drive Mobile

> The [Twake Drive](https://twake.app) client for **Android** and **iOS** — browse, search, share, edit and take your files offline.

![Platform: Android | iOS](https://img.shields.io/badge/platform-Android%20%7C%20iOS-2e7d32)
![Release: v0.2.2](https://img.shields.io/badge/release-v0.2.2-1976d2)
![Built with Expo](https://img.shields.io/badge/Expo-React%20Native-000020)

Twake Drive Mobile is a [React Native](https://reactnative.dev/) /
[Expo](https://expo.dev/) app that talks to a Twake Drive (Cozy) instance through
[`cozy-client`](https://github.com/cozy/cozy-client). It puts your drive on your
phone: file and folder browsing, global search, favourites, sharing, offline
pinning, in-app document editors, and a settings/account experience in seven
languages.

## Features

- 📁 **Browse** files and folders in list or grid view
- 🔎 **Search** the whole drive by name
- ⭐ **Favourites** — mark and browse, synced to the server
- 📤 **Share** — receive files from the OS share sheet and upload; create share links
- 🔌 **Offline** — pin files and folders for offline access
- 📝 **Edit** — open Notes, OnlyOffice and Twake Docs without a second sign-in
- ⚙️ **Settings** — real account, theme, and a language switcher
- 🌍 **7 languages** — English, French, Spanish, Italian, German, Vietnamese, Russian
- 🤖 📱 **Android & iOS** — including an Android `DocumentsProvider` and iOS extensions

## Getting started

### Prerequisites

- **Node.js 20+** — the Expo runtime fails on Node 16 (`FormData is not defined`)
- **npm** — `package-lock.json` is the canonical lockfile (this project does not use yarn)
- **Xcode** — for the iOS simulator and device builds
- **JDK 17** — for Android; Gradle 8.14 / the Android Gradle Plugin fail on newer
  JDKs (e.g. JDK 24)

### Install & run

```bash
npm install --legacy-peer-deps

npm run ios       # iOS simulator (requires Xcode)
npm run android   # Android emulator or connected device
```

### Android on a physical device

Point `JAVA_HOME` at a JDK 17 (macOS + Homebrew `openjdk@17` shown):

```bash
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
npm run android   # builds, installs and launches on the connected device
```

Tip — to cut the first native build time, restrict the ABIs to your device's
architecture:

```bash
ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a npm run android
```

> **The `android/` and `ios/` native projects are committed and hand-maintained.**
> Do **not** run `expo prebuild` — it would overwrite the manual native
> configuration (extensions, providers, signing).

## Testing

```bash
npm test          # Jest unit tests
npm run typecheck # TypeScript (tsc)
npm run lint      # ESLint
```

End-to-end tests use [Maestro](https://maestro.mobile.dev/) against a real device
or the iOS simulator — see **[docs/e2e-testing.md](docs/e2e-testing.md)**.

## Building & releasing

Signed releases are cut from a `vX.Y.Z` git tag, which triggers the fastlane
pipeline: **iOS → TestFlight** (match) and **Android → Firebase App Distribution**
(and optionally Play internal). See
**[docs/ci-cd-signed-release.md](docs/ci-cd-signed-release.md)**.

```bash
scripts/release.sh 0.2.2   # bump package.json/app.json, commit, tag, push → release
```

## Project structure

```
app/            expo-router screens (drive, search, settings, share, editors)
src/            cozy queries, files logic, UI components, auth, offline, i18n
android/        committed native Android project (+ DocumentsProvider)
ios/            committed native iOS project (+ Share & File Provider extensions)
e2e/maestro/    Maestro end-to-end flows and shared subflows
docs/           runbooks (CI/CD, signed release, E2E) and design specs
scripts/        release + native signing helpers
```

## Contributing

1. Branch from `main`.
2. Keep `npm test`, `npm run typecheck` and `npm run lint` green.
3. Open a pull request — CI runs unit tests, type-check, lint, a security scan and
   Android/iOS builds.

Code and commit messages are in English and follow
[Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
`ci:`, `docs:` …). See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

Twake Drive Mobile is part of the [Twake Drive](https://github.com/linagora/twake-drive)
project and follows its licensing (**AGPL-3.0**). A `LICENSE` file should be
committed to this repository to state it explicitly.

## Acknowledgements

Built on [Expo](https://expo.dev/), [React Native](https://reactnative.dev/),
[cozy-client](https://github.com/cozy/cozy-client) and
[react-native-paper](https://callstack.github.io/react-native-paper/).
