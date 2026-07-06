# Changelog

All notable changes to Twake Drive Mobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-07-06

### Fixed

- **Login completion on Android** — after the flagship certification redirect, a
  cross-platform quirk (`WebBrowser.dismissBrowser()` returns void on Android but a
  Promise on iOS) threw a TypeError that swallowed the auth completion, looping the
  user back to the email screen (and re-showing the consent page). Guarded so the
  login now completes — finishing the mobile-only login fix started in 0.2.1
  (device-verified end to end: certify → consent → signed in).

## [0.2.1] - 2026-07-05

### Fixed

- **Flagship certification loop on mobile** — the first-time "application not
  certified" screen emails a 6-digit code, but leaving to the mail app to read it
  dismissed the certification tab and bounced back to the email screen, an
  inescapable loop on a mobile-only device. The tab now survives the app switch (a
  plain Custom Tab plus `cozy://` deep-link capture instead of an auth session).

### Changed

- iOS releases attach the signed IPA to the tag's GitHub Release, at parity with
  the Android APK. A new `provision-ios` workflow provisions match signing profiles
  for new app extensions (used to wire the File Provider extension's signing).

## [0.2.0] - 2026-07-05

First feature release. 0.1.0 was a read-only proof of concept; 0.2.0 turns Twake
Drive Mobile into a full read/write client on **both Android and iOS**, with
search, sharing, offline access, document editing, a settings experience and
seven languages.

### Added

- **Android support** — the app builds, runs and installs on Android, including a
  `DocumentsProvider` (Storage Access Framework) so Twake Drive files appear in the
  system file picker. (#1, #9)
- **Global search** — find files and folders by name from a top-level search
  screen, backed by a paginated, index-friendly query. (#7, #14, #15)
- **Favorites** — mark files/folders as favourites and browse them in a dedicated
  tab; changes persist to the server through the files API. (#4, #26, #34, #36)
- **Share to Twake Drive** — receive files from the OS share sheet, browse folders
  and upload (Android; iOS Share Extension foundation in place). (#11, #23)
- **Offline access** — pin files and folders for offline use, with per-item and
  per-folder state and a sync indicator. (#26, #34)
- **Document editors** — open Notes, OnlyOffice and Twake Docs. Flagship
  certification at login plus a shared WebView SSO cookie let editors open without
  a second sign-in. (#13, #17, #21, #22)
- **Settings & account** — a dismissable settings modal with a language switcher,
  theme selection and the real signed-in account. (#27)
- **Seven languages** — English, French, Spanish, Italian, German, Vietnamese and
  Russian, with device-language detection and a persistent picker. (#28)
- **iOS extensions foundation** — a Share Extension (Phase 2 Lot A+B) and an inert
  File Provider foundation with 37 unit tests gated in CI. (#23, #29, #33)
- **End-to-end test suite** — Maestro smoke flows covering launch, tabs, search,
  folder CRUD, favourites and offline, running on both a real Android device and
  the iOS simulator. See [docs/e2e-testing.md](docs/e2e-testing.md). (#25, #30, #31)
- **Signed release pipeline** — tag-driven fastlane release: iOS to TestFlight
  (match) and Android to Firebase App Distribution / Play internal. See
  [docs/ci-cd-signed-release.md](docs/ci-cd-signed-release.md). (#16, #18, #19)
- **UI alignment** — the Twake Drive web charter and icons; a theme-adaptive
  status bar. (#2, #8)

### Fixed

- **Search** no longer times out on rare terms or runs out of memory on large
  drives — the local `$regex` scan was replaced with a paginated `_find` plus a
  client-side contains filter. (#10, #15)
- **Favorites** now persist correctly: un-favouriting writes through the files API
  (a generic `client.save` only touched the offline replica and reverted on sync),
  the list refreshes immediately on removal, and trashed items no longer leak into
  Favoris. (#34, #36)
- **Six drive bugs** — offline badge on the grid, favourites listing, recents
  ordering and future dates, and list refresh after delete/restore. (#26)
- **Three drive bugs** — PDF preview back button, unsupported-mime handling, the
  public share-link toggle and the share-sheet safe area. (#35)
- **Document editor header** — no longer clipped on narrow screens; slimmer,
  flatter header. (#20, #22)
- **Auth** — falls back to the default keychain when the shared access group is
  unavailable, which unblocks the iOS simulator. (#24)

### Changed

- Native build caching in CI (ccache, Gradle build cache, CocoaPods) to speed up
  the New-Architecture native compile.

### Known issues

- The **iOS signed release** requires a one-time provisioning setup for the File
  Provider extension (App Group + `match` profile) before TestFlight uploads
  succeed; Android 0.2.0 ships to Firebase App Distribution.

[Unreleased]: https://github.com/mmaudet/twake-drive-mobile/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/mmaudet/twake-drive-mobile/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/mmaudet/twake-drive-mobile/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/mmaudet/twake-drive-mobile/releases/tag/v0.2.0
