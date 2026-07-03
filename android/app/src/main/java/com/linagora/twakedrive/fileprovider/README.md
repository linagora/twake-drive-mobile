# Android DocumentsProvider (SAF)

Exposes the whole Twake Drive to Android's Storage Access Framework so any app
can browse and edit Drive files/folders as if local (Files app + every
`ACTION_OPEN_DOCUMENT`/`ACTION_CREATE_DOCUMENT`/`ACTION_OPEN_DOCUMENT_TREE`
picker). Native Kotlin; runs on binder threads, outside the React Native runtime.

## Components

- **`TwakeDocumentsProvider`** — the SAF entry point: roots, children, open
  (read + write-back), thumbnails, create/rename/move/delete, `isChildDocument`.
- **`CozyStackApi`** — OkHttp client over cozy-stack `io.cozy.files`
  (list/get/download/thumbnail/create/upload/rename/move/trash/statByPath); a
  `401` triggers a single-flight token refresh via `SessionStore`.
- **`SessionStore` + `EncryptedCredentialStore`** — durable OAuth creds
  (`uri`, `clientId`, `clientSecret`, `refreshToken`) mirrored from the RN app
  (`src/native/twakeAuthBridge.ts` → `authbridge/TwakeAuthBridgeModule`) into
  `EncryptedSharedPreferences`; the provider mints its own access token from the
  shared refresh token.
- **`DocumentMapper`** — cozy JSON ⇄ SAF `MatrixCursor` rows + flags/mime.
- **`DocumentCache`** — `cacheDir/fileprovider/` content cache + read-only
  fast-path over the RN app's pinned offline blobs (`filesDir/offline/{id}`);
  `invalidate(id)` drops the cache after a write-back.

## Notes

- `minSdk 24`: write-back uses the temp-file + `ParcelFileDescriptor.open(…,
  OnCloseListener)` strategy (not the API-26 `openProxyFileDescriptor`).
- The provider is declared in `AndroidManifest.xml` guarded by
  `android.permission.MANAGE_DOCUMENTS` (system-only bind); the
  `plugins/withTwakeDocumentsProvider.js` Expo config plugin keeps the
  manifest/gradle/MainApplication additions reproducible across prebuilds.
- Kotlin/Robolectric unit tests are a local quality gate (no CI job runs Gradle
  tests today); provider methods themselves are verified by on-device QA.

Design & plan: `docs/superpowers/specs/2026-07-02-android-documents-provider-design.md`,
`docs/superpowers/plans/2026-07-02-android-documents-provider.md`.

Follow-ups: search, recents, a "Shared with me" root, `copyDocument`,
`EXTRA_LOADING` incremental paging for very large folders, and the iOS
`NSFileProviderReplicatedExtension` mirroring `CozyStackApi`/`SessionStore`.
