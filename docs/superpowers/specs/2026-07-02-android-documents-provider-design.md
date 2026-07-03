# Android DocumentsProvider — browse & edit the Drive from any app

> **Status:** implemented (T1–T10) on `feat/android-documents-provider`; unit-tested + per-task reviewed; local CI-equivalent gates green (lint / typecheck / jest 365 / `assembleRelease`). On-device QA pending. PR targets `feat/android-support`.
>
> **Branch / worktree:** `feat/android-documents-provider` at
> `../twake-drive-mobile-fileprovider`, based on `feat/android-support`.
> Dedicated PR targets `feat/android-support`.

## 1. Context and goal

The user wants Twake Drive to expose the whole Drive to the rest of the OS, so
**any** app can browse and edit the user's folders and files as if they were
local — the iOS *File Provider* experience, and its Android equivalent.

This spec covers the **Android** side (the platform we start with). iOS
`NSFileProviderReplicatedExtension` is an explicit follow-up PR that will mirror
the same auth/API semantics in Swift.

On Android the OS-level mechanism is the **Storage Access Framework (SAF)**: an
app that subclasses `android.provider.DocumentsProvider` and declares the
`android.content.action.DOCUMENTS_PROVIDER` intent becomes a *documents
provider*. Its roots then appear in the system **Files/Documents** app and in
every `ACTION_OPEN_DOCUMENT` / `ACTION_CREATE_DOCUMENT` /
`ACTION_OPEN_DOCUMENT_TREE` picker system-wide (Gmail attach, image pickers,
editors' "Open", etc.).

### 1.1 Framing decisions (agreed before this spec)

- **Data source:** *Live API + cache.* The provider talks directly to
  cozy-stack over HTTP for listing and content, downloads on demand, and caches
  locally. It reuses the existing offline blob cache
  (`documentDirectory/offline/{id}`) read-only as a fast path when a file is
  already pinned. → the **entire** Drive is browsable, not just pinned items.
- **Scope:** *Full read + write.* Browse, open/preview, download, plus create
  folder, create/upload file, rename, move, delete (to trash), and
  edit-in-place (write-back on close).
- **Platform:** *Android first.* iOS File Provider is a later PR.
- **v1 SAF surface:** core R/W + image thumbnails. Deferred to follow-ups:
  `FLAG_SUPPORTS_SEARCH`, `SUPPORTS_RECENTS`, a "Shared with me" root,
  `copyDocument`, and `EXTRA_LOADING` incremental paging for very large folders.

### 1.2 The structural constraint

A `DocumentsProvider` is a `ContentProvider`: it runs in the app's process but
**outside the React Native runtime**, on binder threads, and is often invoked
while the RN UI is not running at all. It therefore **cannot** reuse the
TypeScript `cozy-client` stack (queries, auth refresh, PouchDB). The auth +
cozy-stack HTTP layer is **re-implemented in Kotlin**. This Kotlin layer is
designed so its behaviour can be re-expressed 1:1 in Swift for the iOS PR.

Rejected alternative — *delegate SAF calls to a Headless JS task to reuse the TS
code*: SAF methods (`queryChildDocuments`, `openDocument`, …) are called
synchronously, at high frequency, with tight latency expectations, frequently
when no JS context exists. Booting/keeping a headless RN context per call is
slow and fragile. Rejected.

## 2. High-level architecture

```
   Other apps (Gmail, editors, Files) ── SAF pickers / DocumentsUI
                     │  binder IPC (system-mediated, MANAGE_DOCUMENTS)
                     ▼
   ┌──────────────────────────────────────────────────────────┐
   │  TwakeDocumentsProvider : DocumentsProvider               │
   │  queryRoots / queryChildDocuments / queryDocument         │
   │  openDocument(r|w) / openDocumentThumbnail                │
   │  createDocument / renameDocument / moveDocument /         │
   │  deleteDocument / removeDocument / isChildDocument        │
   └───┬───────────────┬───────────────┬──────────────────────┘
       │               │               │
       ▼               ▼               ▼
 ┌───────────┐  ┌──────────────┐  ┌──────────────────┐
 │DocumentMap│  │ CozyStackApi │  │  DocumentCache   │
 │per        │  │ OkHttp:      │  │ cacheDir/        │
 │ JSON⇄rows │  │ list/stat/   │  │  fileprovider/   │
 │ +SAF flags│  │ dl/upload/   │  │ + read-only      │
 └───────────┘  │ mkdir/patch/ │  │  fast-path on    │
                │ trash        │  │ offline/{id}     │
                └──────┬───────┘  └──────────────────┘
                       │ Bearer token
                       ▼
                ┌──────────────────────────────┐
                │ SessionStore                 │
                │ EncryptedSharedPreferences   │
                │ {uri,clientId,clientSecret,  │
                │  refreshToken} (+ cached AT) │
                │ single-flight refresh on 401 │
                └──────────────▲───────────────┘
                               │ syncSession(json)/clearSession()
                ┌──────────────┴───────────────┐
                │ TwakeAuthBridge (RN module)  │  ← called from JS on
                │ registered in MainApplication│    login / refresh / logout
                └──────────────────────────────┘
                               ▲
                     ┌─────────┴──────────┐
                     │ src/auth (TS):     │
                     │ registerSession,   │
                     │ useAuth, revocation│
                     └────────────────────┘
```

New Kotlin package: `com.linagora.twakedrive.fileprovider`.

| Component | Responsibility |
|---|---|
| `TwakeDocumentsProvider` | SAF entry point. Implements the query/open/create/rename/move/delete/isChild methods; maps SAF `documentId` ⇄ cozy `_id`; calls `notifyChange` after mutations. |
| `CozyStackApi` | Stateless OkHttp wrapper over the cozy-stack `io.cozy.files` REST surface (§4). Attaches the Bearer token from `SessionStore`; retries once after a 401-triggered refresh. |
| `SessionStore` | Reads durable creds from `EncryptedSharedPreferences`; owns the short-lived access-token cache; performs single-flight OAuth refresh (§3). |
| `DocumentCache` | On-disk content cache under `cacheDir/fileprovider/`; read-only fast path over the pinned offline blob dir; temp-file staging for write-back. |
| `DocumentMapper` | Converts cozy file JSON ⇄ SAF `MatrixCursor` rows (Root/Document columns) and computes per-item flags. |
| `TwakeAuthBridge` (+ `TwakeAuthBridgePackage`) | Legacy RN native module exposing `syncSession(json)` / `clearSession()` to JS; the sole writer of the durable creds into `EncryptedSharedPreferences`. |

## 3. Session sharing & auth

### 3.1 Why a bridge, not a direct read of expo-secure-store

The session (`{uri, oauthOptions, token}`) lives in `expo-secure-store`, whose
on-disk format (AES/RSA via Android Keystore inside a private
`SharedPreferences` file) is **not a public contract** and changes between
versions. Rather than reverse-engineer it from native code, the RN app
**explicitly hands the provider what it needs** through a tiny native module.

### 3.2 What is shared, and who owns what

`SessionStore` uses a dedicated `EncryptedSharedPreferences` file
(`twake_fileprovider_session`, AES256-GCM, master key in Android Keystore):

| Key | Written by | Meaning |
|---|---|---|
| `uri` | RN app (bridge) | cozy-stack instance base URL |
| `clientId`, `clientSecret` | RN app (bridge) | OAuth client credentials |
| `refreshToken` | RN app (bridge) | durable refresh token |
| `accessToken` | provider | short-lived token cache, minted by the provider |

Source of truth for the durable creds is the RN app's `expo-secure-store`
session; the bridge mirrors `{uri, clientId, clientSecret, refreshToken}` into
the store **on every session create/change** and clears the store on logout.
The provider never writes the durable creds — it only mints and caches its own
access token from the refresh token.

**Call sites (TS):** `src/auth/registerSession.ts` (and wherever a refreshed
session is persisted) calls `TwakeAuthBridge.syncSession(JSON)`;
`src/auth/tokenStorage.clearSession` and the revocation listener call
`clearSession()`.

### 3.3 Token lifecycle in the provider

The provider is **lazy**: it uses the cached `accessToken`; on any `401` it runs
a **single-flight** refresh (`synchronized`, re-read after acquiring the lock so
concurrent binder threads don't stampede):

```
POST {uri}/auth/access_token
  grant_type=refresh_token&client_id=…&client_secret=…&refresh_token=…
→ { access_token, refresh_token?, token_type, scope }
```

On success: cache `access_token`, retry the original request **once**. On
`400 invalid_grant` (or missing creds): clear the cached token and treat the
root as **auth-required** — `queryRoots` returns an empty cursor so the root
disappears from pickers until the user re-opens the app and re-authenticates.

**Assumption to verify in the plan:** cozy-stack does **not** rotate the refresh
token on refresh (long-lived refresh token), so app and provider can each
maintain their own access token from the same shared refresh token without
divergence. If the stack *does* rotate it, the provider must write the new
refresh token back through the store and the app must re-read it — tracked as a
risk in §11.

## 4. cozy-stack API contract (Kotlin `CozyStackApi`)

All requests carry `Authorization: Bearer <accessToken>` and
`Accept: application/vnd.api+json` (except binary download/upload). `documentId`
== cozy `_id`; the root's `documentId` == `io.cozy.files.root-dir`.

| Operation | HTTP | Notes |
|---|---|---|
| List a directory | `GET /files/:dirId` | JSON:API; children in `included[]`, `links.next` for paging. Filter `trash-dir`/`shared-drives-dir` (`HIDDEN_ROOT_DIR_IDS`). |
| Get metadata | `GET /files/:id` | one file/dir doc. |
| Stat by path | `GET /files/metadata?Path=…` | conflict resolution for move. |
| Download content | `GET /files/download/:id` | binary body (matches existing `Downloader`/`streamUrl`). |
| Thumbnail | `GET {doc.links.small\|medium}` | Bearer; images only. |
| Create folder | `POST /files/:dirId?Type=directory&Name=…` | returns new doc. |
| Create file | `POST /files/:dirId?Type=file&Name=…` | body = bytes (0-byte at create; content via write-back); `Content-Type`, optional `Content-MD5`. |
| Overwrite content | `PUT /files/:id` | new version; body = bytes; `Content-Type`, optional `Content-MD5`. |
| Rename / move | `PATCH /files/:id` | JSON:API `{data:{type,id,attributes:{name?|dir_id?}}}`. 409 on move → resolve like `src/files/moveEntry.ts`. |
| Trash | `DELETE /files/:id` | moves to trash. |
| Refresh token | `POST /auth/access_token` | §3.3. |

## 5. SAF surface mapping

### 5.1 Roots

`queryRoots` emits **one** root (v1): `rootId="twake"`,
`documentId="io.cozy.files.root-dir"`, `title="Twake Drive"`,
summary = the instance domain, `flags = FLAG_SUPPORTS_CREATE |
FLAG_SUPPORTS_IS_CHILD`. No session ⇒ empty cursor (root hidden).

### 5.2 Read methods

- `queryChildDocuments(parentId, projection, sortOrder)` → `GET /files/:parentId`;
  emit one row per child, hidden system dirs filtered. v1 loops pages
  synchronously up to a cap (default 500) and **logs** truncation beyond it (no
  silent cap); `EXTRA_LOADING` streaming is a follow-up.
- `queryDocument(documentId, projection)` → `GET /files/:id` (root special-cased).
- `openDocument(documentId, "r", signal)` → if a pinned blob exists in
  `offline/{id}`, return a read-only FD over it; else download via
  `GET /files/download/:id` into `cacheDir/fileprovider/{id}` and return a
  read-only FD.
- `openDocumentThumbnail(documentId, sizeHint, signal)` → fetch `links.small/medium`
  into cache, return an `AssetFileDescriptor` (images only).

### 5.3 Column & flag mapping (`DocumentMapper`)

Per document: `COLUMN_DOCUMENT_ID` (`_id`), `COLUMN_DISPLAY_NAME` (`name`),
`COLUMN_MIME_TYPE` (`MIME_TYPE_DIR` for directories, else `mime`/guessed),
`COLUMN_SIZE` (`size`), `COLUMN_LAST_MODIFIED` (`updated_at`), `COLUMN_FLAGS`:

- **File:** `FLAG_SUPPORTS_WRITE | FLAG_SUPPORTS_DELETE | FLAG_SUPPORTS_RENAME |
  FLAG_SUPPORTS_MOVE | FLAG_SUPPORTS_REMOVE` (+ `FLAG_SUPPORTS_THUMBNAIL` for images).
- **Directory:** `FLAG_DIR_SUPPORTS_CREATE | FLAG_SUPPORTS_DELETE |
  FLAG_SUPPORTS_RENAME | FLAG_SUPPORTS_MOVE | FLAG_SUPPORTS_REMOVE`.

### 5.4 Write methods

- `createDocument(parentId, mimeType, displayName)` → directory when
  `mimeType == MIME_TYPE_DIR` (`POST …Type=directory`), else 0-byte file
  (`POST …Type=file`); returns the new `documentId`.
- `openDocument(documentId, "w"|"rw", signal)` → **temp-file strategy** (portable
  on `minSdk 24`, below `openProxyFileDescriptor`'s API 26): stage a temp file in
  `cacheDir/fileprovider/` (seeded with current bytes for `"rw"`), hand back
  `ParcelFileDescriptor.open(tmp, mode, handler, onClose)`. On close →
  `PUT /files/:id` with the temp bytes, then `notifyChange`. Upload failures are
  logged (SAF gives no post-close error channel to the caller) — §11.
- `renameDocument(documentId, name)` → `PATCH …{attributes:{name}}`; returns
  `null` (id stable).
- `moveDocument(documentId, sourceParentId, targetParentId)` →
  `PATCH …{attributes:{dir_id: targetParentId}}`; 409 resolved as in
  `moveEntry.ts` (stat conflicting path → trash it → retry). Requires
  `isChildDocument`.
- `deleteDocument(documentId)` / `removeDocument(documentId, parentId)` →
  `DELETE /files/:id` (→ trash).
- `isChildDocument(parentId, documentId)` → bounded walk up `dir_id`
  (metadata-cached) until `parentId`/root/limit.

After every mutation: `context.contentResolver.notifyChange(
buildChildDocumentsUri(AUTHORITY, parentId), null)` so pickers refresh.

## 6. Cache, offline, and app-state interactions

- **Content cache:** `cacheDir/fileprovider/{id}` (OS-evictable). Reuse of the
  pinned blob is **read-only** — the provider never mutates the RN-owned offline
  store. The native side resolves that blob as `File(context.filesDir,
  "offline/{id}")`, since expo-file-system's `documentDirectory` maps to
  `context.filesDir` for this package.
- **Offline reads:** a pinned file opens offline from its blob; a non-pinned
  file requires network (download) — same trade-off as the rest of the app.
- **Eventual consistency with the app's PouchDB mirror:** provider mutations go
  straight to the stack (source of truth). The RN app's local replica catches up
  on its next `triggerPouchReplication` (already fired on foreground/sync). The
  provider always reads live, so it is never stale. Documented, accepted for v1;
  no cross-process cache invalidation in v1.

## 7. Expo integration & build

`android/` is committed and never full-prebuilt, so the Kotlin sources are the
committed source of truth. A **config plugin** keeps the *generated* additions
reproducible if `expo prebuild` ever runs:

- **Kotlin sources:** committed under
  `android/app/src/main/java/com/linagora/twakedrive/fileprovider/` and the
  bridge under `…/twakedrive/authbridge/`.
- **`plugins/withTwakeDocumentsProvider.js`** (added to `app.json` `plugins`):
  - `withAndroidManifest` — inject the `<provider>`:
    ```xml
    <provider
      android:name="com.linagora.twakedrive.fileprovider.TwakeDocumentsProvider"
      android:authorities="com.linagora.twakedrive.documents"
      android:exported="true"
      android:grantUriPermissions="true"
      android:permission="android.permission.MANAGE_DOCUMENTS">
      <intent-filter>
        <action android:name="android.content.action.DOCUMENTS_PROVIDER"/>
      </intent-filter>
    </provider>
    ```
    (We do **not** hold `MANAGE_DOCUMENTS`; guarding the provider with it means
    only the system may bind.)
  - `withAppBuildGradle` — add
    `implementation("androidx.security:security-crypto:1.1.0-alpha06")`
    (version to confirm against the toolchain — §11.5).
  - `withMainApplication` — register `TwakeAuthBridgePackage()` in `getPackages()`.
  - *(Optional, for `prebuild --clean` safety)* `withDangerousMod` to copy the
    Kotlin sources from a plugin template — deferred unless the team adopts
    clean prebuilds; committed sources are canonical.
- **CI:** the provider compiles as part of the existing app module; the current
  GitHub Actions Android job builds it with no new step. A build over the new
  provider is the CI gate.

## 8. Concurrency, security, error handling

- **Concurrency:** SAF calls arrive on multiple binder threads. One shared,
  thread-safe `OkHttpClient`; `SessionStore` refresh is `synchronized`
  single-flight; cache writes are per-`id` (temp file + atomic rename).
- **Security:** provider bound only by the system (`MANAGE_DOCUMENTS`);
  `documentId`s are opaque cozy `_id`s; content cache is app-private; tokens live
  only in `EncryptedSharedPreferences`; **tokens are never logged**.
- **Errors:** network/5xx → throw (`FileNotFoundException`/`IOException` per SAF
  contract) so the picker shows a transient failure while the root persists; 404
  → `FileNotFoundException`; 401 → refresh+retry (§3.3); 409 on move → conflict
  resolution (§5.4).

## 9. Testing strategy

- **JVM / Robolectric + OkHttp `MockWebServer`:**
  - `DocumentMapper` — JSON → cursor rows & flags (file vs dir, image thumbnail
    flag, hidden-dir filtering).
  - `SessionStore` — lazy use of cached token; 401 → single-flight refresh →
    retry; `invalid_grant` → auth-required; concurrent-thread stampede guard.
  - `CozyStackApi` — exact request shape for list/download/upload/mkdir/
    patch(rename+move)/trash; 409 move conflict resolution.
- **RN (Jest):** `registerSession`/`clearSession` invoke `TwakeAuthBridge`
  (mock the native module) with the correct payload.
- **Manual / instrumented:** add the root in Files; open a PDF from Gmail's
  attach picker; create folder / create file / rename / move / delete; edit a
  `.txt` in a text editor and confirm write-back (new version on the stack);
  open a pinned file with networking off.

## 10. v1 scope vs. follow-ups

**In v1:** single "Twake Drive" root; full R/W (create/upload/rename/move/
delete/edit-in-place); download + content cache + pinned-blob fast path; image
thumbnails; auth bridge + provider token refresh; config plugin; unit tests.

**Follow-ups (own PRs):** `FLAG_SUPPORTS_SEARCH`, `SUPPORTS_RECENTS`, "Shared
with me" root, `copyDocument`, `EXTRA_LOADING` incremental paging, backup
exclusion of the cache dir, and the **iOS `NSFileProviderReplicatedExtension`**
mirroring `CozyStackApi`/`SessionStore`.

## 11. Risks & open questions

1. **Refresh-token rotation** (§3.3): if cozy-stack rotates refresh tokens on
   refresh, provider-side refresh must propagate the new token back to the app.
   Verify against the stack; if rotating, add provider→app write-back.
2. **Write-back error surfacing:** SAF offers no post-close error channel; a
   failed upload on FD close can only be logged (and retried best-effort). Assess
   whether a user-visible signal (notification) is warranted.
3. **Large folders:** v1 caps synchronous paging (logged); confirm the cap is
   high enough for real Drives before `EXTRA_LOADING` lands.
4. **New Architecture module:** the bridge is a legacy `ReactPackage` relying on
   the New-Arch interop layer; confirm it registers cleanly, else switch to a
   TurboModule or a local Expo module.
5. **`security-crypto` version:** pick a version compatible with the Expo SDK 54
   / AGP toolchain (stable `1.0.0` vs `1.1.0-alpha`).
