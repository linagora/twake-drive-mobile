# Signed releases

Everything needed to build and publish Twake Drive Mobile is in this repository:
the workflows, the fastlane lanes and the helper scripts. What is not, and
cannot be, is the set of credentials they use — those live as GitHub Actions
secrets on the repository the release runs from. This page is what to put
there, where each value comes from, and how a release is cut.

## What runs where

| Workflow                        | Trigger             | What it does                                                                                                         |
| ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                        | every push / PR     | tests, typecheck, lint                                                                                               |
| `security.yml`                  | every push / PR     | Trivy filesystem scan                                                                                                |
| `build-android.yml`             | every push / PR     | unsigned release APK, as an artefact                                                                                 |
| `build-ios.yml`, `test-ios.yml` | every push / PR     | unsigned iOS build, simulator tests                                                                                  |
| `release-ios.yml`               | `v*` tag, or manual | signed IPA → TestFlight (`fastlane ios distribute`), optionally App Store metadata (`ios release`)                   |
| `release-android.yml`           | `v*` tag, or manual | signed AAB → Firebase App Distribution (`fastlane android distribute`), optionally Play internal (`android release`) |
| `provision-ios.yml`             | manual              | registers the app extensions' identifiers and profiles through `fastlane ios provision_extensions`                   |
| `release-preflight.yml`         | manual              | says which release secrets are present, without revealing any value                                                  |

## The secrets

Set on the repository the tags are pushed to. None of them is in git; the
example file `.release-secrets.env.example` lists the same names with a blank
next to each.

### Android

| Secret                                                                   | What it is                     | Where it comes from                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`                                                | the upload keystore, base64    | **must be the keystore the published app already uses** — see "Taking the releases over"                       |
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

## Taking the releases over from another repository

Two of the credentials cannot simply be recreated, because the stores tie an
app to them:

- **The Android upload keystore.** Google Play accepts an update only if it is
  signed with the key it already knows. Copy the keystore and its passwords
  from whoever is building today. If it is lost, Play App Signing can reset the
  upload key (Play console → Setup → App integrity), which takes a support
  round-trip.
- **The iOS certificates.** They live encrypted in the match repository, and
  the App Store expects builds signed by that team. Either get read access to
  the existing match repository (a deploy key on it, plus its passphrase), or
  run `fastlane match init` against a repository you own and let it create new
  certificates. Do not run `fastlane match nuke` while another CI still uses
  them: it revokes the certificates for everyone on that team.

Everything else can be reissued on your own account: a new App Store Connect
API key, a new Firebase service account, a new deploy key.

## What is still shared

The credentials in place were not minted for this app alone, which is worth
knowing before treating the takeover as finished:

- the Firebase and Play service account is visio-mobile's;
- the match passphrase decrypts a certificates repository shared with
  visio-mobile, hosted on a personal account rather than the organisation.

So iOS releases depend on a repository nobody here owns. Moving to credentials
issued for Twake Drive and a certificates repository under the organisation is
tracked separately.

## Cutting a release

```bash
scripts/release.sh 0.3.0        # bumps package.json + app.json, commits, tags, pushes
```

Pushing the tag starts both release workflows. The marketing version is the
tag; the build number is the CI run number, so it always moves forward.

- iOS lands in TestFlight. `publish_to_app_store: true` on a manual run also
  pushes the App Store metadata.
- Android lands in Firebase App Distribution. The Play internal track is the
  `upload to Google Play` input on a manual run.
- Both attach their artefact to the GitHub release.

A manual run (`workflow_dispatch`) builds from the branch you pick, which is
how to test the pipeline without tagging.

## When something fails

- `no matching provisioning profiles` — the extensions' profiles are missing:
  run `provision-ios.yml`, which registers them through match.
- `Invalid Signature` / the wrong team on upload — `APPLE_TEAM_ID` disagrees
  with the certificates in the match repository.
- Play rejects the AAB with a signature error — the keystore is not the upload
  key of the published app; see "Taking the releases over".
- `mergeDexRelease` running out of memory — the Gradle daemon heap, in
  `android/gradle.properties`.
