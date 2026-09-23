# Signed releases

Everything needed to build and publish Twake Drive Mobile is in this repository:
the workflows, the fastlane lanes and the helper scripts. What is not, and
cannot be, is the set of credentials they use — those live as GitHub Actions
secrets on the repository the release runs from. This page is what to put
there, where each value comes from, and how a release is cut.

## What runs where

| Workflow                        | Trigger             | What it does                                                                                                                   |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`                        | every push / PR     | tests, typecheck, lint                                                                                                         |
| `security.yml`                  | every push / PR     | Trivy filesystem scan                                                                                                          |
| `build-android.yml`             | every push / PR     | unsigned release APK, as an artefact                                                                                           |
| `build-ios.yml`, `test-ios.yml` | every push / PR     | unsigned iOS build, simulator tests                                                                                            |
| `release-ios.yml`               | `v*` tag, or manual | signed IPA → TestFlight (`fastlane ios distribute`), optionally App Store metadata (`ios release`)                             |
| `release-android.yml`           | `v*` tag, or manual | signed AAB → Play internal (`fastlane android release`), optionally an APK to Firebase App Distribution (`android distribute`) |
| `provision-ios.yml`             | manual              | registers the app extensions' identifiers and profiles through `fastlane ios provision_extensions`                             |
| `release-preflight.yml`         | manual              | says which release secrets are present, without revealing any value                                                            |

## The secrets

Set on the repository the tags are pushed to. None of them is in git; the
example file `.release-secrets.env.example` lists the same names with a blank
next to each.

### Android

| Secret                                                                   | What it is                     | Where it comes from                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`                                                | the upload keystore, base64    | the keystore the published app is signed with; Play refuses an update signed with another                      |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | its passwords and alias        | with the keystore                                                                                              |
| `FIREBASE_APP_ID`                                                        | the Android app id in Firebase | Firebase console, project settings                                                                             |
| `FIREBASE_SERVICE_ACCOUNT_BASE64`                                        | a service account JSON, base64 | Google Cloud console; needs Firebase App Distribution, and the Play Developer API if `android release` is used |

### iOS

| Secret                                                                                             | What it is                                                             | Where it comes from                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                                                                                    | the Apple developer team                                               | App Store Connect, membership                                                   |
| `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_CONTENT` | an App Store Connect API key (`.p8`, base64) and its identifiers       | App Store Connect → Users and Access → Integrations, as an Admin or App Manager |
| `MATCH_GIT_URL`                                                                                    | the private repository holding the encrypted certificates and profiles | `fastlane match` — see below                                                    |
| `MATCH_PASSWORD`                                                                                   | its passphrase                                                         | whoever ran `match init`                                                        |
| `MATCH_DEPLOY_KEY`                                                                                 | an SSH private key with **write** access to that repository            | a deploy key on the match repository, "Allow write access" ticked               |

Write access, not read: `fastlane ios distribute` fetches with `match(readonly: true)`, so releasing would work with a read key, but `provision_extensions` runs `match(readonly: false)` and pushes new certificates and profiles. A read-only key therefore passes every release and fails the first rotation — silently, since match exits 0 either way. After running `provision-ios.yml`, check that the certificates repository actually received a commit rather than trusting the exit code.

### Setting them

`gh secret set` takes the value from stdin, so nothing lands in a shell history
or in a file this repository tracks:

```bash
cp .release-secrets.env.example .release-secrets.env   # gitignored
$EDITOR .release-secrets.env                           # fill in paths + values
scripts/setup-release-secrets.sh                       # → linagora/twake-drive-mobile
gh secret list --repo linagora/twake-drive-mobile      # names only, never values
```

Then run `release-preflight.yml` from the Actions tab: it reports one line per
secret, set or missing, which is the quickest way to know whether the
repository can release on its own.

## Cutting a release

```bash
scripts/release.sh 0.3.0        # bumps package.json + app.json, commits, tags, pushes
```

Pushing the tag starts both release workflows. The marketing version is the
tag. The Android version code is derived from it (`0.4.2` gives `40299`), so
it follows the releases rather than a CI counter, which restarts at 1 when the
releases move to another repository. Its last two digits rank a prerelease
under the version it leads to, so `0.5.0-rc.1` gives `50001` and `0.5.0` gives
`50099`, and Play never sees the same code twice. The iOS build number is the CI run
number, which TestFlight only needs to be unique within a version.

- iOS lands in TestFlight. `publish_to_app_store: true` on a manual run also
  pushes the App Store metadata.
- Android lands in the Play internal track. A manual run can skip the upload
  (`publish_to_play_store: false`) and keep the AAB as an artefact, or also
  send an APK to Firebase (`distribute_via_firebase: true`).
- The first build of a new Play app cannot go through the API: download the
  AAB artefact of a run without upload and send it by hand in the Play
  Console, which also enrols the app in Play App Signing. The service account
  must be invited in the Play Console (Users and permissions) with release
  rights on the app.
- Both attach their artefact to the GitHub release.

A manual run (`workflow_dispatch`) builds from the branch you pick, which is
how to test the pipeline without tagging.

## When something fails

- `no matching provisioning profiles` — the extensions' profiles are missing:
  run `provision-ios.yml`, which registers them through match.
- `Invalid Signature` / the wrong team on upload — `APPLE_TEAM_ID` disagrees
  with the certificates in the match repository.
- Play rejects the AAB with a signature error — the keystore is not the upload
  key of the published app.
- Play rejects the version code, or a device refuses to install over what it
  has — the version being released is not above the published one. The code
  follows the version, so the fix is to release a higher version.
- `mergeDexRelease` running out of memory — the Gradle daemon heap, in
  `android/gradle.properties`.
