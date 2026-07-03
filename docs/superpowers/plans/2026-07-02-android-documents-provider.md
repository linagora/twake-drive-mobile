# Android DocumentsProvider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the whole Twake Drive to Android's Storage Access Framework so any app can browse and edit Drive folders/files as if local.

**Architecture:** A native Kotlin `DocumentsProvider` (`com.linagora.twakedrive.fileprovider`) talks to cozy-stack over OkHttp (live API + on-disk cache, read-only fast-path over the pinned offline blobs). The RN app mirrors the OAuth session into `EncryptedSharedPreferences` through a small native bridge module; the provider mints its own access token from the shared refresh token and refreshes on 401 via an OkHttp `Authenticator`.

**Tech Stack:** Kotlin, `android.provider.DocumentsProvider` (SAF), OkHttp 4, `androidx.security:security-crypto` (EncryptedSharedPreferences), `org.json`, React Native native module (legacy `ReactPackage`), Expo config plugin, JUnit + Robolectric + OkHttp MockWebServer.

## Global Constraints

- Package / namespace: `com.linagora.twakedrive`. Provider authority: `com.linagora.twakedrive.documents`.
- `minSdk 24` → use the temp-file write-back strategy (`ParcelFileDescriptor.open(File, mode, Handler, OnCloseListener)`); do **not** rely on `openProxyFileDescriptor` (API 26).
- Root `documentId` == `io.cozy.files.root-dir`; every other `documentId` == the cozy file `_id` verbatim.
- Hidden system dirs never listed: `io.cozy.files.trash-dir`, `io.cozy.files.shared-drives-dir`.
- All authed requests carry `Authorization: Bearer <accessToken>` and `Accept: application/vnd.api+json` (binary download/upload excepted).
- Tokens live only in `EncryptedSharedPreferences`; **never log tokens**.
- `android/` is committed and never full-prebuilt; Kotlin sources are the source of truth, the Expo config plugin keeps generated additions reproducible.
- Provider is guarded by `android:permission="android.permission.MANAGE_DOCUMENTS"` (system-only bind); the app does **not** hold that permission.
- Assumption (verify in Task 4): cozy-stack does not rotate the refresh token on refresh.
- Base branch / PR target: `feat/android-support`. Commit style: Conventional Commits; end commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure & shared interfaces

**Production (Kotlin), under `android/app/src/main/java/com/linagora/twakedrive/`:**

- `fileprovider/Models.kt` — `CozyFile` data class + JSON:API parsing helpers.
- `fileprovider/CredentialStore.kt` — `CredentialStore` interface + `EncryptedCredentialStore` impl.
- `fileprovider/SessionStore.kt` — durable creds + access-token cache + single-flight refresh.
- `fileprovider/CozyStackApi.kt` — OkHttp client (`AuthInterceptor`, `TokenAuthenticator`) + all `io.cozy.files` calls.
- `fileprovider/DocumentMapper.kt` — constants, projections, `CozyFile` → `MatrixCursor` rows + flags/mime.
- `fileprovider/DocumentCache.kt` — cache dir, offline fast-path, temp staging.
- `fileprovider/TwakeDocumentsProvider.kt` — the SAF provider.
- `authbridge/TwakeAuthBridgeModule.kt` + `authbridge/TwakeAuthBridgePackage.kt` — RN native module.

**Production (TS):** `src/native/twakeAuthBridge.ts` + call sites in `src/auth/tokenStorage.ts` (`saveSession`/`clearSession` — the single session persistence point).

**Config / build:** `plugins/withTwakeDocumentsProvider.js`, `app.json`, `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/linagora/twakedrive/MainApplication.kt`.

**Tests (Kotlin), under `android/app/src/test/java/com/linagora/twakedrive/fileprovider/`:** `CozyStackApiTest.kt`, `SessionStoreTest.kt`, `DocumentMapperTest.kt`. **Tests (TS):** `src/native/twakeAuthBridge.test.ts`.

**Key signatures (locked; later tasks depend on these exact names/types):**

```kotlin
// Models.kt
data class CozyFile(
  val id: String,
  val name: String,
  val isDir: Boolean,
  val dirId: String?,      // parent; null for root
  val size: Long,          // 0 for dirs
  val mime: String?,       // null for dirs
  val klass: String?,      // cozy "class" (image/text/...); null for dirs
  val updatedAt: Long,     // epoch millis; 0 if unknown
  val path: String?        // present for dirs, sometimes files
) {
  companion object {
    fun fromAttributes(id: String, attrs: org.json.JSONObject): CozyFile
    fun hasThumbnail(): Boolean            // instance: klass == "image"
  }
}

// CredentialStore.kt
interface CredentialStore {
  fun getString(key: String): String?
  fun putAll(values: Map<String, String>)
  fun clear()
}
class EncryptedCredentialStore(context: android.content.Context) : CredentialStore

// SessionStore.kt
class SessionStore(private val store: CredentialStore, private val http: okhttp3.OkHttpClient) {
  data class Creds(val uri: String, val clientId: String, val clientSecret: String, val refreshToken: String)
  fun creds(): Creds?                      // null if any durable field missing
  fun baseUri(): String?
  fun accessToken(): String?
  @Synchronized fun refreshAccessToken(previous: String?): String?   // single-flight; null on invalid_grant
  fun saveSession(uri: String, clientId: String, clientSecret: String, refreshToken: String)
  fun clear()
}

// CozyStackApi.kt
class AuthRequiredException(msg: String) : java.io.IOException(msg)
class CozyStackApi(private val session: SessionStore) {
  fun list(dirId: String, cap: Int = 500): List<CozyFile>
  fun get(id: String): CozyFile
  fun download(id: String, dest: java.io.File)
  fun thumbnail(file: CozyFile, dest: java.io.File): Boolean
  fun createDirectory(parentId: String, name: String): CozyFile
  fun createFile(parentId: String, name: String, mime: String): CozyFile
  fun upload(id: String, src: java.io.File, mime: String): CozyFile
  fun rename(id: String, newName: String): CozyFile
  fun move(id: String, targetParentId: String): CozyFile
  fun trash(id: String)
  fun statByPath(path: String): CozyFile?
}

// DocumentMapper.kt
object DocumentMapper {
  const val AUTHORITY = "com.linagora.twakedrive.documents"
  const val ROOT_ID = "twake"
  const val ROOT_DOC_ID = "io.cozy.files.root-dir"
  val HIDDEN_IDS = setOf("io.cozy.files.trash-dir", "io.cozy.files.shared-drives-dir")
  val DEFAULT_ROOT_PROJECTION: Array<String>
  val DEFAULT_DOCUMENT_PROJECTION: Array<String>
  fun addRootRow(cursor: android.database.MatrixCursor, domain: String)
  fun addFileRow(cursor: android.database.MatrixCursor, f: CozyFile)
  fun mimeOf(f: CozyFile): String
  fun flagsFor(f: CozyFile): Int
}

// DocumentCache.kt
class DocumentCache(private val context: android.content.Context) {
  fun cachedFile(id: String): java.io.File
  fun offlineBlob(id: String): java.io.File?
  fun ensureLocal(id: String, api: CozyStackApi): java.io.File   // offline blob or download
  fun tempFor(id: String): java.io.File
}
```

---

## Task 1: Build wiring, Expo config plugin, stub provider

Deliverable: the app compiles with the new dependency, a stub provider is registered and installable, and `expo prebuild` reproduces the manifest/gradle/MainApplication additions. No Drive data yet.

**Files:**
- Modify: `android/app/build.gradle` (deps + `testOptions`)
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt` (stub)
- Create: `plugins/withTwakeDocumentsProvider.js`
- Modify: `app.json` (register plugin)
- Modify: `android/app/src/main/java/com/linagora/twakedrive/MainApplication.kt` (import placeholder comment only — real registration in Task 3)

**Interfaces:**
- Produces: an installed `content://com.linagora.twakedrive.documents` provider (stub returns empty cursors).

- [ ] **Step 1: Add dependencies + test config to `android/app/build.gradle`**

Replace the `dependencies { … }` block's closing so it includes the new lines (add before the final `}` at line 182):

```gradle
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit")
```

Add a `testOptions` block inside `android { … }` (e.g. after the `androidResources { … }` block, before line 133's closing `}`):

```gradle
    testOptions {
        unitTests {
            includeAndroidResources = true
            returnDefaultValues = false
        }
    }
```

- [ ] **Step 2: Register the provider in `AndroidManifest.xml`**

Inside `<application>…</application>`, after the `<service …ExpoVideoPlaybackService…/>` block, add:

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

- [ ] **Step 3: Create the stub provider**

`android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt`:

```kotlin
package com.linagora.twakedrive.fileprovider

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsProvider

/**
 * SAF entry point. Stub in Task 1 — real behaviour lands in Tasks 6–11.
 */
class TwakeDocumentsProvider : DocumentsProvider() {

    override fun onCreate(): Boolean = true

    override fun queryRoots(projection: Array<out String>?): Cursor =
        MatrixCursor(projection ?: DocumentMapper.DEFAULT_ROOT_PROJECTION)

    override fun queryDocument(documentId: String?, projection: Array<out String>?): Cursor =
        MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)

    override fun queryChildDocuments(
        parentDocumentId: String?,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor = throw UnsupportedOperationException("Not implemented yet")
}
```

Because this references `DocumentMapper`, add a minimal `DocumentMapper.kt` now with just the two projections and constants (the rest lands in Task 6):

`android/app/src/main/java/com/linagora/twakedrive/fileprovider/DocumentMapper.kt`:

```kotlin
package com.linagora.twakedrive.fileprovider

import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root

object DocumentMapper {
    const val AUTHORITY = "com.linagora.twakedrive.documents"
    const val ROOT_ID = "twake"
    const val ROOT_DOC_ID = "io.cozy.files.root-dir"
    val HIDDEN_IDS = setOf("io.cozy.files.trash-dir", "io.cozy.files.shared-drives-dir")

    val DEFAULT_ROOT_PROJECTION = arrayOf(
        Root.COLUMN_ROOT_ID, Root.COLUMN_FLAGS, Root.COLUMN_TITLE,
        Root.COLUMN_DOCUMENT_ID, Root.COLUMN_ICON, Root.COLUMN_SUMMARY
    )
    val DEFAULT_DOCUMENT_PROJECTION = arrayOf(
        Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE,
        Document.COLUMN_FLAGS, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED
    )
}
```

- [ ] **Step 4: Create the Expo config plugin**

`plugins/withTwakeDocumentsProvider.js`:

```js
const {
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
} = require('expo/config-plugins')

const AUTHORITY = 'com.linagora.twakedrive.documents'
const PROVIDER = 'com.linagora.twakedrive.fileprovider.TwakeDocumentsProvider'

function addProvider(androidManifest) {
  const app = androidManifest.manifest.application[0]
  app.provider = app.provider || []
  const exists = app.provider.some(p => p.$['android:authorities'] === AUTHORITY)
  if (!exists) {
    app.provider.push({
      $: {
        'android:name': PROVIDER,
        'android:authorities': AUTHORITY,
        'android:exported': 'true',
        'android:grantUriPermissions': 'true',
        'android:permission': 'android.permission.MANAGE_DOCUMENTS',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.content.action.DOCUMENTS_PROVIDER' } }] },
      ],
    })
  }
  return androidManifest
}

function addDependency(src) {
  const dep = 'implementation("androidx.security:security-crypto:1.1.0-alpha06")'
  if (src.includes(dep)) return src
  return src.replace(/dependencies\s*\{/, match => `${match}\n    ${dep}`)
}

function addPackage(src) {
  const reg = 'add(com.linagora.twakedrive.authbridge.TwakeAuthBridgePackage())'
  if (src.includes(reg)) return src
  return src.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{)/,
    `$1\n              ${reg}`
  )
}

module.exports = function withTwakeDocumentsProvider(config) {
  config = withAndroidManifest(config, c => {
    c.modResults = addProvider(c.modResults)
    return c
  })
  config = withAppBuildGradle(config, c => {
    c.modResults.contents = addDependency(c.modResults.contents)
    return c
  })
  config = withMainApplication(config, c => {
    c.modResults.contents = addPackage(c.modResults.contents)
    return c
  })
  return config
}
```

- [ ] **Step 5: Register the plugin in `app.json`**

Add `"./plugins/withTwakeDocumentsProvider"` to the `expo.plugins` array (last entry).

- [ ] **Step 6: Build and verify**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

Run (config plugin idempotency): `npx expo config --type introspect | grep -A3 documents`
Expected: the provider authority appears once.

- [ ] **Step 7: Commit**

```bash
git add android/app/build.gradle android/app/src/main/AndroidManifest.xml \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/ \
  plugins/withTwakeDocumentsProvider.js app.json
git commit -m "feat(android): register stub DocumentsProvider + Expo config plugin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Credential store + SessionStore accessors

Deliverable: `SessionStore` reads/writes durable creds through a `CredentialStore`, unit-tested with an in-memory fake. Refresh comes in Task 4.

**Files:**
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/CredentialStore.kt`
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/SessionStore.kt`
- Test: `android/app/src/test/java/com/linagora/twakedrive/fileprovider/SessionStoreTest.kt`

**Interfaces:**
- Produces: `CredentialStore`, `EncryptedCredentialStore`, `SessionStore` (see signatures above). Consumed by Tasks 3, 4, 6–11.

- [ ] **Step 1: Write the failing test**

`SessionStoreTest.kt`:

```kotlin
package com.linagora.twakedrive.fileprovider

import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FakeCredentialStore : CredentialStore {
    val map = mutableMapOf<String, String>()
    override fun getString(key: String) = map[key]
    override fun putAll(values: Map<String, String>) { map.putAll(values) }
    override fun clear() { map.clear() }
}

class SessionStoreTest {
    private fun store() = SessionStore(FakeCredentialStore(), OkHttpClient())

    @Test fun `creds is null until a session is saved`() {
        assertNull(store().creds())
    }

    @Test fun `saveSession persists durable creds and baseUri`() {
        val s = store()
        s.saveSession("https://alice.mycozy.cloud", "cid", "secret", "rt")
        val c = s.creds()!!
        assertEquals("https://alice.mycozy.cloud", c.uri)
        assertEquals("cid", c.clientId)
        assertEquals("secret", c.clientSecret)
        assertEquals("rt", c.refreshToken)
        assertEquals("https://alice.mycozy.cloud", s.baseUri())
    }

    @Test fun `clear wipes everything`() {
        val s = store()
        s.saveSession("https://a", "c", "s", "r")
        s.clear()
        assertNull(s.creds())
        assertNull(s.accessToken())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*SessionStoreTest*"`
Expected: FAIL — `SessionStore`/`CredentialStore` unresolved.

- [ ] **Step 3: Implement `CredentialStore.kt`**

```kotlin
package com.linagora.twakedrive.fileprovider

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

interface CredentialStore {
    fun getString(key: String): String?
    fun putAll(values: Map<String, String>)
    fun clear()
}

class EncryptedCredentialStore(context: Context) : CredentialStore {
    private val prefs by lazy {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "twake_fileprovider_session",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putAll(values: Map<String, String>) {
        prefs.edit().apply { values.forEach { (k, v) -> putString(k, v) } }.apply()
    }

    override fun clear() { prefs.edit().clear().apply() }
}
```

- [ ] **Step 4: Implement `SessionStore.kt` (accessors only; refresh in Task 4)**

```kotlin
package com.linagora.twakedrive.fileprovider

import okhttp3.OkHttpClient

class SessionStore(
    private val store: CredentialStore,
    private val http: OkHttpClient
) {
    data class Creds(
        val uri: String,
        val clientId: String,
        val clientSecret: String,
        val refreshToken: String
    )

    companion object {
        const val KEY_URI = "uri"
        const val KEY_CLIENT_ID = "clientId"
        const val KEY_CLIENT_SECRET = "clientSecret"
        const val KEY_REFRESH_TOKEN = "refreshToken"
        const val KEY_ACCESS_TOKEN = "accessToken"
    }

    fun creds(): Creds? {
        val uri = store.getString(KEY_URI) ?: return null
        val cid = store.getString(KEY_CLIENT_ID) ?: return null
        val secret = store.getString(KEY_CLIENT_SECRET) ?: return null
        val rt = store.getString(KEY_REFRESH_TOKEN) ?: return null
        return Creds(uri.trimEnd('/'), cid, secret, rt)
    }

    fun baseUri(): String? = store.getString(KEY_URI)?.trimEnd('/')

    fun accessToken(): String? = store.getString(KEY_ACCESS_TOKEN)

    fun saveSession(uri: String, clientId: String, clientSecret: String, refreshToken: String) {
        store.putAll(
            mapOf(
                KEY_URI to uri,
                KEY_CLIENT_ID to clientId,
                KEY_CLIENT_SECRET to clientSecret,
                KEY_REFRESH_TOKEN to refreshToken
            )
        )
    }

    fun clear() = store.clear()

    // refreshAccessToken(previous) implemented in Task 4.
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*SessionStoreTest*"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/CredentialStore.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/SessionStore.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/SessionStoreTest.kt
git commit -m "feat(android): credential store + session accessors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Native auth bridge + TS wiring

Deliverable: logging in on device writes `{uri, clientId, clientSecret, refreshToken}` into `EncryptedSharedPreferences`; logging out clears it. This unblocks device testing from Task 7 on.

**Files:**
- Create: `android/app/src/main/java/com/linagora/twakedrive/authbridge/TwakeAuthBridgeModule.kt`
- Create: `android/app/src/main/java/com/linagora/twakedrive/authbridge/TwakeAuthBridgePackage.kt`
- Modify: `android/app/src/main/java/com/linagora/twakedrive/MainApplication.kt`
- Create: `src/native/twakeAuthBridge.ts`
- Modify: `src/auth/tokenStorage.ts`
- Test: `src/native/twakeAuthBridge.test.ts`

**Interfaces:**
- Consumes: `EncryptedCredentialStore`, `SessionStore` (Task 2).
- Produces: JS `syncSession(session)` / `clearSession()`; native module name `"TwakeAuthBridge"`.

- [ ] **Step 1: Write the failing TS test**

`src/native/twakeAuthBridge.test.ts`:

```ts
const syncSession = jest.fn(async () => true)
const clearSession = jest.fn(async () => true)

jest.mock('react-native', () => ({
  NativeModules: { TwakeAuthBridge: { syncSession, clearSession } },
  Platform: { OS: 'android' }
}))

import { mirrorSessionToNative, clearNativeSession } from './twakeAuthBridge'
import type { Session } from '@/auth/types'

const session: Session = {
  uri: 'https://alice.mycozy.cloud',
  oauthOptions: {
    clientID: 'cid', clientSecret: 'secret', clientName: 'x', softwareID: 'y',
    redirectURI: 'z', clientKind: 'mobile', clientURI: 'u', scopes: []
  },
  token: { accessToken: 'at', refreshToken: 'rt', tokenType: 'bearer', scope: '' }
}

beforeEach(() => jest.clearAllMocks())

test('mirrors the durable creds as JSON', async () => {
  await mirrorSessionToNative(session)
  expect(syncSession).toHaveBeenCalledWith(
    JSON.stringify({
      uri: 'https://alice.mycozy.cloud',
      clientId: 'cid',
      clientSecret: 'secret',
      refreshToken: 'rt'
    })
  )
})

test('clear delegates to native', async () => {
  await clearNativeSession()
  expect(clearSession).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- twakeAuthBridge`
Expected: FAIL — module `./twakeAuthBridge` not found.

- [ ] **Step 3: Implement `src/native/twakeAuthBridge.ts`**

```ts
import { NativeModules, Platform } from 'react-native'

import type { Session } from '@/auth/types'

interface TwakeAuthBridgeNative {
  syncSession: (json: string) => Promise<boolean>
  clearSession: () => Promise<boolean>
}

const native: TwakeAuthBridgeNative | undefined =
  NativeModules.TwakeAuthBridge as TwakeAuthBridgeNative | undefined

/**
 * Mirror the durable OAuth creds into the native EncryptedSharedPreferences the
 * Android DocumentsProvider reads. No-op off Android or if the module is absent.
 */
export const mirrorSessionToNative = async (session: Session): Promise<void> => {
  if (Platform.OS !== 'android' || !native) return
  const payload = JSON.stringify({
    uri: session.uri,
    clientId: session.oauthOptions.clientID,
    clientSecret: session.oauthOptions.clientSecret,
    refreshToken: session.token.refreshToken
  })
  try {
    await native.syncSession(payload)
  } catch (err) {
    console.warn('[twakeAuthBridge] syncSession failed', err)
  }
}

export const clearNativeSession = async (): Promise<void> => {
  if (Platform.OS !== 'android' || !native) return
  try {
    await native.clearSession()
  } catch (err) {
    console.warn('[twakeAuthBridge] clearSession failed', err)
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- twakeAuthBridge`
Expected: PASS (2 tests).

- [ ] **Step 5: Mirror on every persist/clear in `src/auth/tokenStorage.ts`**

`saveSession` is the single writer of the stored session (`registerSession` only
returns the session; `useAuth` persists it via `saveSession`). Hook the mirror
there so every login path stays in lockstep, and clear it in `clearSession`.
Replace the whole file:

```ts
import * as SecureStore from 'expo-secure-store'

import { Session } from './types'
import { mirrorSessionToNative, clearNativeSession } from '@/native/twakeAuthBridge'

export const SESSION_KEY = 'twake-drive-session'

export const saveSession = async (session: Session): Promise<void> => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
  await mirrorSessionToNative(session)
}

export const getSession = async (): Promise<Session | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY)
    return null
  }
}

export const clearSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY)
  await clearNativeSession()
}
```

(The existing `src/auth/tokenStorage.test.ts` mocks `react-native`'s
`NativeModules`; since `mirrorSessionToNative` no-ops when the module is absent,
those tests keep passing — run them in Step 8 to confirm.)

- [ ] **Step 6: Implement the native module**

`android/app/src/main/java/com/linagora/twakedrive/authbridge/TwakeAuthBridgeModule.kt`:

```kotlin
package com.linagora.twakedrive.authbridge

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.linagora.twakedrive.fileprovider.EncryptedCredentialStore
import com.linagora.twakedrive.fileprovider.SessionStore
import okhttp3.OkHttpClient
import org.json.JSONObject

class TwakeAuthBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val session by lazy {
        SessionStore(EncryptedCredentialStore(reactApplicationContext), OkHttpClient())
    }

    override fun getName(): String = "TwakeAuthBridge"

    @ReactMethod
    fun syncSession(json: String, promise: Promise) {
        try {
            val o = JSONObject(json)
            session.saveSession(
                o.getString("uri"),
                o.getString("clientId"),
                o.getString("clientSecret"),
                o.getString("refreshToken")
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SYNC_SESSION", e)
        }
    }

    @ReactMethod
    fun clearSession(promise: Promise) {
        try {
            session.clear()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_CLEAR_SESSION", e)
        }
    }
}
```

`android/app/src/main/java/com/linagora/twakedrive/authbridge/TwakeAuthBridgePackage.kt`:

```kotlin
package com.linagora.twakedrive.authbridge

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class TwakeAuthBridgePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(TwakeAuthBridgeModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
```

- [ ] **Step 7: Register the package in `MainApplication.kt`**

Replace the `PackageList(this).packages.apply { … }` body with:

```kotlin
            PackageList(this).packages.apply {
              add(com.linagora.twakedrive.authbridge.TwakeAuthBridgePackage())
            }
```

- [ ] **Step 8: Build, run on device, verify**

Run: `npx expo run:android`
Manual: log in, then confirm the store is written:
`adb shell run-as com.linagora.twakedrive ls -l /data/data/com.linagora.twakedrive/shared_prefs | grep twake_fileprovider_session`
Expected: the encrypted prefs file exists. Log out → the file's contents are cleared (values gone).

- [ ] **Step 9: Regression-check the TS auth tests, then commit**

Run: `npm test -- auth twakeAuthBridge`
Expected: PASS (existing `tokenStorage`/`useAuth` suites still green + the new bridge test).

```bash
git add android/app/src/main/java/com/linagora/twakedrive/authbridge/ \
  android/app/src/main/java/com/linagora/twakedrive/MainApplication.kt \
  src/native/twakeAuthBridge.ts src/native/twakeAuthBridge.test.ts \
  src/auth/tokenStorage.ts
git commit -m "feat(android): auth bridge mirrors session to EncryptedSharedPreferences

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: SessionStore refresh + CozyStackApi read path

Deliverable: `CozyStackApi.list/get/download` work against a MockWebServer, including automatic 401→refresh→retry and `invalid_grant`→`AuthRequiredException`.

**Files:**
- Modify: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/SessionStore.kt` (add `refreshAccessToken`)
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/Models.kt`
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/CozyStackApi.kt` (read methods; write methods in Tasks 8–11)
- Test: `android/app/src/test/java/com/linagora/twakedrive/fileprovider/CozyStackApiTest.kt`
- Modify: `SessionStoreTest.kt` (refresh cases)

**Interfaces:**
- Consumes: `SessionStore`, `CredentialStore` (Task 2).
- Produces: `CozyFile`, `AuthRequiredException`, `CozyStackApi.{list,get,download}`.

- [ ] **Step 1: Write failing tests for refresh + list**

Append to `SessionStoreTest.kt`:

```kotlin
    @Test fun `refresh posts refresh_token grant and caches the new access token`() {
        val server = okhttp3.mockwebserver.MockWebServer()
        server.enqueue(
            okhttp3.mockwebserver.MockResponse()
                .setBody("""{"access_token":"NEW","token_type":"bearer","scope":""}""")
        )
        server.start()
        val fake = FakeCredentialStore()
        val s = SessionStore(fake, OkHttpClient())
        s.saveSession(server.url("/").toString(), "cid", "secret", "rt")

        val token = s.refreshAccessToken(previous = null)

        assertEquals("NEW", token)
        assertEquals("NEW", s.accessToken())
        val req = server.takeRequest()
        assertEquals("/auth/access_token", req.path)
        val body = req.body.readUtf8()
        assert(body.contains("grant_type=refresh_token"))
        assert(body.contains("refresh_token=rt"))
        server.shutdown()
    }

    @Test fun `refresh returns cached token when another thread already refreshed`() {
        val fake = FakeCredentialStore()
        fake.map[SessionStore.KEY_ACCESS_TOKEN] = "CURRENT"
        val s = SessionStore(fake, OkHttpClient())
        s.saveSession("https://a", "c", "s", "r")
        // previous differs from the now-current token → reuse without a network call
        assertEquals("CURRENT", s.refreshAccessToken(previous = "OLD"))
    }

    @Test fun `refresh clears access token and returns null on invalid_grant`() {
        val server = okhttp3.mockwebserver.MockWebServer()
        server.enqueue(okhttp3.mockwebserver.MockResponse().setResponseCode(400)
            .setBody("""{"error":"invalid_grant"}"""))
        server.start()
        val fake = FakeCredentialStore()
        val s = SessionStore(fake, OkHttpClient())
        s.saveSession(server.url("/").toString(), "cid", "secret", "rt")

        assertNull(s.refreshAccessToken(previous = null))
        assertNull(s.accessToken())
        server.shutdown()
    }
```

`CozyStackApiTest.kt`:

```kotlin
package com.linagora.twakedrive.fileprovider

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CozyStackApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: CozyStackApi

    private fun sessionFor(url: String, accessToken: String? = "AT"): SessionStore {
        val fake = FakeCredentialStore()
        if (accessToken != null) fake.map[SessionStore.KEY_ACCESS_TOKEN] = accessToken
        val s = SessionStore(fake, OkHttpClient())
        s.saveSession(url, "cid", "secret", "rt")
        return s
    }

    @Before fun setUp() { server = MockWebServer(); server.start() }
    @After fun tearDown() { server.shutdown() }

    @Test fun `list parses included children and filters hidden dirs`() {
        server.enqueue(MockResponse().setBody("""
          {"data":{"id":"io.cozy.files.root-dir","type":"io.cozy.files",
             "attributes":{"type":"directory","name":"","path":"/"}},
           "included":[
             {"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"3","mime":"text/plain","class":"text","dir_id":"io.cozy.files.root-dir","updated_at":"2026-01-01T00:00:00Z"}},
             {"id":"io.cozy.files.trash-dir","type":"io.cozy.files","attributes":{"type":"directory","name":".trash","dir_id":"io.cozy.files.root-dir"}},
             {"id":"d1","type":"io.cozy.files","attributes":{"type":"directory","name":"Docs","dir_id":"io.cozy.files.root-dir","path":"/Docs"}}
           ],"links":{}}
        """.trimIndent()))
        api = CozyStackApi(sessionFor(server.url("/").toString()))

        val children = api.list("io.cozy.files.root-dir")

        assertEquals(2, children.size) // trash-dir filtered
        val f = children.first { it.id == "f1" }
        assertEquals("a.txt", f.name); assertEquals(3L, f.size); assertEquals(false, f.isDir)
        assertTrue(children.any { it.id == "d1" && it.isDir })
        val req = server.takeRequest()
        assertEquals("/files/io.cozy.files.root-dir", req.path)
        assertEquals("Bearer AT", req.getHeader("Authorization"))
    }

    @Test fun `a 401 triggers one refresh and a retry`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setBody("""{"access_token":"AT2","token_type":"bearer","scope":""}""")) // refresh
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"1"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString(), accessToken = "STALE"))

        val f = api.get("f1")

        assertEquals("a.txt", f.name)
        assertEquals("/files/f1", server.takeRequest().path)          // first, 401
        assertEquals("/auth/access_token", server.takeRequest().path) // refresh
        val retry = server.takeRequest()
        assertEquals("/files/f1", retry.path)
        assertEquals("Bearer AT2", retry.getHeader("Authorization"))
    }

    @Test(expected = AuthRequiredException::class)
    fun `exhausted refresh surfaces AuthRequiredException`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"invalid_grant"}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString(), accessToken = "STALE"))
        api.get("f1")
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*" --tests "*SessionStoreTest*"`
Expected: FAIL — `refreshAccessToken`, `Models`, `CozyStackApi` unresolved.

- [ ] **Step 3: Implement `Models.kt`**

```kotlin
package com.linagora.twakedrive.fileprovider

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class CozyFile(
    val id: String,
    val name: String,
    val isDir: Boolean,
    val dirId: String?,
    val size: Long,
    val mime: String?,
    val klass: String?,
    val updatedAt: Long,
    val path: String?
) {
    fun hasThumbnail(): Boolean = klass == "image"

    companion object {
        private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }

        private fun parseDate(s: String?): Long {
            if (s.isNullOrBlank()) return 0L
            return try { iso.parse(s.substring(0, 19))?.time ?: 0L } catch (e: Exception) { 0L }
        }

        fun fromAttributes(id: String, a: JSONObject): CozyFile {
            val isDir = a.optString("type") == "directory"
            return CozyFile(
                id = id,
                name = a.optString("name", ""),
                isDir = isDir,
                dirId = a.optString("dir_id").ifBlank { null },
                size = if (isDir) 0L else a.optString("size", "0").toLongOrNull() ?: 0L,
                mime = a.optString("mime").ifBlank { null },
                klass = a.optString("class").ifBlank { null },
                updatedAt = parseDate(a.optString("updated_at").ifBlank { null }),
                path = a.optString("path").ifBlank { null }
            )
        }
    }
}
```

- [ ] **Step 4: Implement `SessionStore.refreshAccessToken`**

Add to `SessionStore` (replace the `// refreshAccessToken…` comment):

```kotlin
    @Synchronized
    fun refreshAccessToken(previous: String?): String? {
        val current = accessToken()
        // Another thread already refreshed while we waited on the lock.
        if (current != null && current != previous) return current
        val c = creds() ?: return null
        val form = okhttp3.FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("client_id", c.clientId)
            .add("client_secret", c.clientSecret)
            .add("refresh_token", c.refreshToken)
            .build()
        val req = okhttp3.Request.Builder()
            .url("${c.uri}/auth/access_token")
            .post(form)
            .header("Accept", "application/json")
            .build()
        return try {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    store.putAll(mapOf(KEY_ACCESS_TOKEN to ""))
                    return null
                }
                val token = org.json.JSONObject(resp.body!!.string()).getString("access_token")
                store.putAll(mapOf(KEY_ACCESS_TOKEN to token))
                token
            }
        } catch (e: Exception) {
            null
        }
    }
```

Note: `store.putAll(KEY_ACCESS_TOKEN to "")` then `accessToken()` returns `""`; treat empty as absent. Update `accessToken()`:

```kotlin
    fun accessToken(): String? = store.getString(KEY_ACCESS_TOKEN)?.ifBlank { null }
```

- [ ] **Step 5: Implement `CozyStackApi.kt` (read path + auth plumbing)**

```kotlin
package com.linagora.twakedrive.fileprovider

import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

class AuthRequiredException(msg: String) : IOException(msg)

class CozyStackApi(private val session: SessionStore) {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(session))
        .authenticator(TokenAuthenticator(session))
        .build()

    private class AuthInterceptor(private val s: SessionStore) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val req = chain.request()
            if (req.header("Authorization") != null) return chain.proceed(req)
            val token = s.accessToken()
            val authed = if (token != null)
                req.newBuilder().header("Authorization", "Bearer $token").build() else req
            return chain.proceed(authed)
        }
    }

    private class TokenAuthenticator(private val s: SessionStore) : Authenticator {
        override fun authenticate(route: Route?, response: Response): Request? {
            if (responseCount(response) >= 2) return null // already retried once
            val previous = response.request.header("Authorization")?.removePrefix("Bearer ")
            val fresh = s.refreshAccessToken(previous) ?: return null
            return response.request.newBuilder()
                .header("Authorization", "Bearer $fresh").build()
        }
        private fun responseCount(response: Response): Int {
            var r: Response? = response; var n = 1
            while (r?.priorResponse != null) { n++; r = r.priorResponse }
            return n
        }
    }

    private fun base(): String =
        session.baseUri() ?: throw AuthRequiredException("no session")

    private fun exec(req: Request): Response {
        val resp = client.newCall(req).execute()
        when {
            resp.isSuccessful -> return resp
            resp.code == 401 -> { resp.close(); throw AuthRequiredException("unauthorized") }
            resp.code == 404 -> { resp.close(); throw FileNotFoundException(req.url.encodedPath) }
            else -> { val c = resp.code; resp.close(); throw IOException("HTTP $c ${req.url.encodedPath}") }
        }
    }

    private fun jsonGet(path: String): JSONObject {
        val req = Request.Builder().url("${base()}$path")
            .header("Accept", "application/vnd.api+json").build()
        exec(req).use { return JSONObject(it.body!!.string()) }
    }

    fun get(id: String): CozyFile {
        val data = jsonGet("/files/$id").getJSONObject("data")
        return CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
    }

    fun list(dirId: String, cap: Int = 500): List<CozyFile> {
        val out = ArrayList<CozyFile>()
        var path: String? = "/files/$dirId"
        var pages = 0
        while (path != null && out.size < cap) {
            val json = jsonGet(path)
            val included = json.optJSONArray("included") ?: break
            for (i in 0 until included.length()) {
                val node = included.getJSONObject(i)
                val id = node.getString("id")
                if (id in DocumentMapper.HIDDEN_IDS) continue
                out.add(CozyFile.fromAttributes(id, node.getJSONObject("attributes")))
            }
            val next = json.optJSONObject("links")?.optString("next").orEmpty()
            path = if (next.isBlank()) null else next.substringAfter(base()).ifBlank { next }
            if (++pages > 50) { android.util.Log.w("TwakeDP", "list($dirId) truncated at $pages pages"); break }
        }
        if (out.size >= cap) android.util.Log.w("TwakeDP", "list($dirId) hit cap=$cap")
        return out
    }

    fun download(id: String, dest: File) {
        val req = Request.Builder().url("${base()}/files/download/$id").build()
        exec(req).use { resp ->
            dest.parentFile?.mkdirs()
            dest.outputStream().use { out -> resp.body!!.byteStream().copyTo(out) }
        }
    }

    // Write methods (createDirectory/createFile/upload/rename/move/trash),
    // thumbnail, and statByPath land in Tasks 7–11.
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*" --tests "*SessionStoreTest*"`
Expected: PASS (SessionStore 6, CozyStackApi 3).

- [ ] **Step 7: Verify the refresh-token assumption (§11.1)**

Manual: on a test instance, call `POST {uri}/auth/access_token` twice with the same refresh token and confirm both succeed (refresh token not rotated). If the stack rotates it, add a follow-up step to write the rotated `refresh_token` back via the store and note it in the spec. Record the outcome in the PR description.

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/Models.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/SessionStore.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/CozyStackApi.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/
git commit -m "feat(android): cozy-stack read API with single-flight 401 refresh

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: DocumentMapper rows & flags

Deliverable: `CozyFile` → SAF cursor rows with correct mime/flags, unit-tested under Robolectric.

**Files:**
- Modify: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/DocumentMapper.kt`
- Test: `android/app/src/test/java/com/linagora/twakedrive/fileprovider/DocumentMapperTest.kt`

**Interfaces:**
- Consumes: `CozyFile` (Task 4).
- Produces: `DocumentMapper.{addRootRow, addFileRow, mimeOf, flagsFor}`.

- [ ] **Step 1: Write the failing test**

`DocumentMapperTest.kt`:

```kotlin
package com.linagora.twakedrive.fileprovider

import android.database.MatrixCursor
import android.provider.DocumentsContract.Document
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DocumentMapperTest {

    private fun file(isDir: Boolean, klass: String? = null, mime: String? = null) =
        CozyFile("id1", "n", isDir, "p", 42L, mime, klass, 1000L, if (isDir) "/n" else null)

    @Test fun `directory mime is the SAF dir type`() {
        assertEquals(Document.MIME_TYPE_DIR, DocumentMapper.mimeOf(file(isDir = true)))
    }

    @Test fun `file mime falls back to octet-stream`() {
        assertEquals("application/octet-stream", DocumentMapper.mimeOf(file(isDir = false)))
        assertEquals("text/plain", DocumentMapper.mimeOf(file(isDir = false, mime = "text/plain")))
    }

    @Test fun `file flags allow write rename move delete`() {
        val flags = DocumentMapper.flagsFor(file(isDir = false))
        assertTrue(flags and Document.FLAG_SUPPORTS_WRITE != 0)
        assertTrue(flags and Document.FLAG_SUPPORTS_RENAME != 0)
        assertTrue(flags and Document.FLAG_SUPPORTS_MOVE != 0)
        assertTrue(flags and Document.FLAG_SUPPORTS_DELETE != 0)
    }

    @Test fun `image files advertise a thumbnail`() {
        val flags = DocumentMapper.flagsFor(file(isDir = false, klass = "image"))
        assertTrue(flags and Document.FLAG_SUPPORTS_THUMBNAIL != 0)
    }

    @Test fun `directory advertises create but not write`() {
        val flags = DocumentMapper.flagsFor(file(isDir = true))
        assertTrue(flags and Document.FLAG_DIR_SUPPORTS_CREATE != 0)
        assertEquals(0, flags and Document.FLAG_SUPPORTS_WRITE)
    }

    @Test fun `addFileRow fills the document id and name`() {
        val c = MatrixCursor(DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        DocumentMapper.addFileRow(c, file(isDir = false, mime = "text/plain"))
        c.moveToFirst()
        assertEquals("id1", c.getString(c.getColumnIndex(Document.COLUMN_DOCUMENT_ID)))
        assertEquals("n", c.getString(c.getColumnIndex(Document.COLUMN_DISPLAY_NAME)))
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*DocumentMapperTest*"`
Expected: FAIL — `mimeOf/flagsFor/addFileRow` unresolved.

- [ ] **Step 3: Extend `DocumentMapper.kt`**

Add imports and members (keep the Task 1 constants/projections):

```kotlin
import android.database.MatrixCursor
import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root

    fun mimeOf(f: CozyFile): String =
        if (f.isDir) Document.MIME_TYPE_DIR else (f.mime ?: "application/octet-stream")

    fun flagsFor(f: CozyFile): Int {
        var flags = Document.FLAG_SUPPORTS_DELETE or
            Document.FLAG_SUPPORTS_RENAME or
            Document.FLAG_SUPPORTS_MOVE or
            Document.FLAG_SUPPORTS_REMOVE
        if (f.isDir) {
            flags = flags or Document.FLAG_DIR_SUPPORTS_CREATE
        } else {
            flags = flags or Document.FLAG_SUPPORTS_WRITE
            if (f.hasThumbnail()) flags = flags or Document.FLAG_SUPPORTS_THUMBNAIL
        }
        return flags
    }

    fun addFileRow(cursor: MatrixCursor, f: CozyFile) {
        cursor.newRow()
            .add(Document.COLUMN_DOCUMENT_ID, f.id)
            .add(Document.COLUMN_DISPLAY_NAME, f.name)
            .add(Document.COLUMN_MIME_TYPE, mimeOf(f))
            .add(Document.COLUMN_FLAGS, flagsFor(f))
            .add(Document.COLUMN_SIZE, f.size)
            .add(Document.COLUMN_LAST_MODIFIED, if (f.updatedAt > 0) f.updatedAt else null)
    }

    fun addRootRow(cursor: MatrixCursor, domain: String) {
        cursor.newRow()
            .add(Root.COLUMN_ROOT_ID, ROOT_ID)
            .add(Root.COLUMN_DOCUMENT_ID, ROOT_DOC_ID)
            .add(Root.COLUMN_TITLE, "Twake Drive")
            .add(Root.COLUMN_SUMMARY, domain)
            .add(Root.COLUMN_FLAGS, Root.FLAG_SUPPORTS_CREATE or Root.FLAG_SUPPORTS_IS_CHILD)
            .add(Root.COLUMN_ICON, com.linagora.twakedrive.R.mipmap.ic_launcher)
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*DocumentMapperTest*"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/DocumentMapper.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/DocumentMapperTest.kt
git commit -m "feat(android): map cozy files to SAF rows and flags

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Provider read methods — browse the Drive

Deliverable: the "Twake Drive" root appears in the Files app and folders browse live.

**Files:**
- Modify: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt`

**Interfaces:**
- Consumes: `SessionStore`, `CozyStackApi`, `DocumentMapper` (Tasks 2/4/5).

- [ ] **Step 1: Implement `onCreate` + read methods**

Replace the stub body:

```kotlin
package com.linagora.twakedrive.fileprovider

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsProvider

class TwakeDocumentsProvider : DocumentsProvider() {

    private lateinit var session: SessionStore
    private lateinit var api: CozyStackApi

    override fun onCreate(): Boolean {
        val ctx = context ?: return false
        session = SessionStore(EncryptedCredentialStore(ctx), okhttp3.OkHttpClient())
        api = CozyStackApi(session)
        return true
    }

    override fun queryRoots(projection: Array<out String>?): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_ROOT_PROJECTION)
        val uri = session.baseUri() ?: return cursor // no session → hide root
        if (session.creds() == null) return cursor
        val domain = uri.substringAfter("://").substringBefore('/')
        DocumentMapper.addRootRow(cursor, domain)
        return cursor
    }

    override fun queryDocument(documentId: String?, projection: Array<out String>?): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        val id = documentId ?: return cursor
        DocumentMapper.addFileRow(cursor, api.get(id))
        return cursor
    }

    override fun queryChildDocuments(
        parentDocumentId: String?,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val cursor = MatrixCursor(projection ?: DocumentMapper.DEFAULT_DOCUMENT_PROJECTION)
        val parent = parentDocumentId ?: return cursor
        for (f in api.list(parent)) DocumentMapper.addFileRow(cursor, f)
        // Register for change notifications so notifyChange() after a mutation
        // refreshes this listing in the picker.
        context?.let {
            cursor.setNotificationUri(
                it.contentResolver,
                android.provider.DocumentsContract.buildChildDocumentsUri(
                    DocumentMapper.AUTHORITY, parent)
            )
        }
        return cursor
    }

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor = throw UnsupportedOperationException("Task 7")
}
```

- [ ] **Step 2: Build, run, verify browse**

Run: `npx expo run:android`
Manual: Files app → hamburger → "Twake Drive" root visible → tap → folders/files list matches the app → open a subfolder. (Opening a file still fails until Task 7.)

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt
git commit -m "feat(android): browse Drive roots and folders via SAF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Content cache + openDocument (read) + thumbnails

Deliverable: files open (download-on-demand + pinned-blob fast path) from any app; image thumbnails render.

**Files:**
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/DocumentCache.kt`
- Modify: `CozyStackApi.kt` (add `thumbnail`)
- Modify: `TwakeDocumentsProvider.kt` (`openDocument` read, `openDocumentThumbnail`)
- Test: `android/app/src/test/java/com/linagora/twakedrive/fileprovider/DocumentCacheTest.kt`

**Interfaces:**
- Consumes: `CozyStackApi.download` (Task 4).
- Produces: `DocumentCache.{cachedFile, offlineBlob, ensureLocal, tempFor}`, `CozyStackApi.thumbnail`.

- [ ] **Step 1: Write the failing cache test (Robolectric)**

`DocumentCacheTest.kt`:

```kotlin
package com.linagora.twakedrive.fileprovider

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class DocumentCacheTest {
    private val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test fun `cachedFile lives under cacheDir fileprovider`() {
        val f = DocumentCache(ctx).cachedFile("abc")
        assertTrue(f.absolutePath.contains("/cache/"))
        assertTrue(f.absolutePath.endsWith("/fileprovider/abc"))
    }

    @Test fun `offlineBlob returns the pinned file when present`() {
        val cache = DocumentCache(ctx)
        assertNull(cache.offlineBlob("xyz"))
        val blob = File(ctx.filesDir, "offline/xyz").apply { parentFile?.mkdirs(); writeText("hi") }
        assertEquals(blob, cache.offlineBlob("xyz"))
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*DocumentCacheTest*"`
Expected: FAIL — `DocumentCache` unresolved.

- [ ] **Step 3: Implement `DocumentCache.kt`**

```kotlin
package com.linagora.twakedrive.fileprovider

import android.content.Context
import java.io.File

class DocumentCache(private val context: Context) {

    private fun dir(): File = File(context.cacheDir, "fileprovider").apply { mkdirs() }

    fun cachedFile(id: String): File = File(dir(), id)

    /** Read-only fast path over the RN-owned pinned offline blob. */
    fun offlineBlob(id: String): File? =
        File(context.filesDir, "offline/$id").takeIf { it.exists() }

    /** A local, readable copy: pinned blob if present, else download to cache. */
    fun ensureLocal(id: String, api: CozyStackApi): File {
        offlineBlob(id)?.let { return it }
        val dest = cachedFile(id)
        if (!dest.exists() || dest.length() == 0L) {
            val tmp = File(dir(), "$id.dl")
            api.download(id, tmp)
            if (!tmp.renameTo(dest)) { tmp.copyTo(dest, overwrite = true); tmp.delete() }
        }
        return dest
    }

    fun tempFor(id: String): File = File(dir(), "$id.tmp")
}
```

- [ ] **Step 4: Add `CozyStackApi.thumbnail`**

Append inside `CozyStackApi` (before the trailing comment):

```kotlin
    fun thumbnail(file: CozyFile, dest: File): Boolean {
        // cozy-stack exposes thumbnails via the file's medium link; fetch it directly.
        val url = "${base()}/files/${file.id}/thumbnails/medium"
        val req = Request.Builder().url(url).build()
        return try {
            exec(req).use { resp ->
                dest.parentFile?.mkdirs()
                dest.outputStream().use { out -> resp.body!!.byteStream().copyTo(out) }
            }
            true
        } catch (e: IOException) { false }
    }
```

(If thumbnails 404 for a given class, `flagsFor` already gates this to images; the `false` return lets the picker fall back to a generic icon.)

- [ ] **Step 5: Implement `openDocument` (read) + `openDocumentThumbnail`**

In `TwakeDocumentsProvider`, replace the `openDocument` throw and add the thumbnail override + a `cache` field:

```kotlin
    private lateinit var cache: DocumentCache
    // …in onCreate(), after api = …:
    // cache = DocumentCache(ctx)

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val wantsWrite = (mode ?: "r").contains('w')
        if (wantsWrite) return openForWrite(id, mode!!) // Task 9
        val local = cache.ensureLocal(id, api)
        return ParcelFileDescriptor.open(local, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun openDocumentThumbnail(
        documentId: String?,
        sizeHint: android.graphics.Point?,
        signal: CancellationSignal?
    ): android.content.res.AssetFileDescriptor? {
        val id = documentId ?: return null
        val f = cache.cachedFile("$id.thumb")
        if (!f.exists() || f.length() == 0L) {
            if (!api.thumbnail(api.get(id), f)) return null
        }
        val pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
        return android.content.res.AssetFileDescriptor(pfd, 0, AssetFileDescriptor.UNKNOWN_LENGTH)
    }

    private fun openForWrite(id: String, mode: String): ParcelFileDescriptor =
        throw UnsupportedOperationException("Task 9")
```

Add `import android.content.res.AssetFileDescriptor` and update `onCreate` to set `cache = DocumentCache(ctx)`.

- [ ] **Step 6: Run cache test + build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*DocumentCacheTest*" && ./gradlew :app:assembleDebug`
Expected: tests PASS (2), BUILD SUCCESSFUL.

- [ ] **Step 7: Manual verify**

`npx expo run:android` → from Gmail "attach file" pick a PDF in Twake Drive → it opens/attaches; open an image → thumbnail shows; turn networking off and open a **pinned** file → still opens.

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/DocumentCache.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/CozyStackApi.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/DocumentCacheTest.kt
git commit -m "feat(android): open documents (download + pinned fast path) and thumbnails

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Create folder & create file

Deliverable: other apps can create folders and new (empty) files in the Drive.

**Files:**
- Modify: `CozyStackApi.kt` (`createDirectory`, `createFile`)
- Modify: `TwakeDocumentsProvider.kt` (`createDocument` + `notifyChange` helper)
- Modify: `CozyStackApiTest.kt`

**Interfaces:**
- Produces: `CozyStackApi.{createDirectory, createFile}`; provider `createDocument`.

- [ ] **Step 1: Write failing API tests**

Append to `CozyStackApiTest.kt`:

```kotlin
    @Test fun `createDirectory posts Type=directory`() {
        server.enqueue(MockResponse().setBody("""{"data":{"id":"newdir","type":"io.cozy.files","attributes":{"type":"directory","name":"New","dir_id":"p"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val d = api.createDirectory("p", "New")
        assertEquals("newdir", d.id); assertTrue(d.isDir)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertTrue(req.path!!.startsWith("/files/p?"))
        assertTrue(req.path!!.contains("Type=directory"))
        assertTrue(req.path!!.contains("Name=New"))
    }

    @Test fun `createFile posts Type=file with an empty body`() {
        server.enqueue(MockResponse().setBody("""{"data":{"id":"nf","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"0","mime":"text/plain","dir_id":"p"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val f = api.createFile("p", "a.txt", "text/plain")
        assertEquals("nf", f.id); assertEquals(false, f.isDir)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertTrue(req.path!!.contains("Type=file"))
        assertEquals(0, req.bodySize)
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*"`
Expected: FAIL — `createDirectory`/`createFile` unresolved.

- [ ] **Step 3: Implement the API methods**

Append inside `CozyStackApi` (add imports `okhttp3.HttpUrl`, `okhttp3.MediaType.Companion.toMediaTypeOrNull`, `okhttp3.RequestBody.Companion.toRequestBody`):

```kotlin
    private fun postForFile(pathAndQuery: String, body: okhttp3.RequestBody): CozyFile {
        val req = Request.Builder().url("${base()}$pathAndQuery")
            .header("Accept", "application/vnd.api+json").post(body).build()
        exec(req).use {
            val data = JSONObject(it.body!!.string()).getJSONObject("data")
            return CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
        }
    }

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    fun createDirectory(parentId: String, name: String): CozyFile =
        postForFile("/files/$parentId?Type=directory&Name=${enc(name)}",
            ByteArray(0).toRequestBody(null))

    fun createFile(parentId: String, name: String, mime: String): CozyFile =
        postForFile("/files/$parentId?Type=file&Name=${enc(name)}",
            ByteArray(0).toRequestBody(mime.toMediaTypeOrNull()))
```

- [ ] **Step 4: Implement provider `createDocument` + `notifyChange`**

In `TwakeDocumentsProvider`:

```kotlin
    override fun createDocument(
        parentDocumentId: String?,
        mimeType: String?,
        displayName: String?
    ): String {
        val parent = parentDocumentId ?: throw java.io.FileNotFoundException("null parent")
        val name = displayName ?: "untitled"
        val created = if (mimeType == android.provider.DocumentsContract.Document.MIME_TYPE_DIR)
            api.createDirectory(parent, name)
        else api.createFile(parent, name, mimeType ?: "application/octet-stream")
        notifyChange(parent)
        return created.id
    }

    private fun notifyChange(parentDocumentId: String) {
        val uri = android.provider.DocumentsContract.buildChildDocumentsUri(
            DocumentMapper.AUTHORITY, parentDocumentId)
        context?.contentResolver?.notifyChange(uri, null)
    }
```

- [ ] **Step 5: Run tests + build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*" && ./gradlew :app:assembleDebug`
Expected: PASS, BUILD SUCCESSFUL.

- [ ] **Step 6: Manual verify**

From a text editor's "Save as"/`ACTION_CREATE_DOCUMENT` → choose Twake Drive → a new file appears in the app; create a folder from the Files app.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/CozyStackApi.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/CozyStackApiTest.kt
git commit -m "feat(android): create folders and files via SAF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Write-back — edit files in place

Deliverable: editing a Drive file from another app uploads a new version on FD close.

**Files:**
- Modify: `CozyStackApi.kt` (`upload`)
- Modify: `TwakeDocumentsProvider.kt` (`openForWrite`)
- Modify: `CozyStackApiTest.kt`

**Interfaces:**
- Produces: `CozyStackApi.upload`; provider write-mode `openDocument`.

- [ ] **Step 1: Write failing upload test**

Append to `CozyStackApiTest.kt`:

```kotlin
    @Test fun `upload PUTs new content to the file`() {
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"5","mime":"text/plain"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val tmp = File.createTempFile("up", null).apply { writeText("hello") }
        val f = api.upload("f1", tmp, "text/plain")
        assertEquals("f1", f.id)
        val req = server.takeRequest()
        assertEquals("PUT", req.method)
        assertEquals("/files/f1", req.path)
        assertEquals("hello", req.body.readUtf8())
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*"`
Expected: FAIL — `upload` unresolved.

- [ ] **Step 3: Implement `CozyStackApi.upload`**

```kotlin
    fun upload(id: String, src: File, mime: String): CozyFile {
        val body = src.asRequestBody(mime.toMediaTypeOrNull())
        val req = Request.Builder().url("${base()}/files/$id")
            .header("Accept", "application/vnd.api+json").put(body).build()
        exec(req).use {
            val data = JSONObject(it.body!!.string()).getJSONObject("data")
            return CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
        }
    }
```

Add import `okhttp3.RequestBody.Companion.asRequestBody`.

- [ ] **Step 4: Implement provider `openForWrite` (temp-file + upload on close)**

Replace `openForWrite`:

```kotlin
    private fun openForWrite(id: String, mode: String): ParcelFileDescriptor {
        val tmp = cache.tempFor(id)
        // Seed the temp file with current content for read-modify-write modes.
        if (mode.contains('r') || mode.contains('a')) {
            try { cache.ensureLocal(id, api).copyTo(tmp, overwrite = true) }
            catch (e: Exception) { tmp.writeBytes(ByteArray(0)) }
        } else if (!tmp.exists()) {
            tmp.writeBytes(ByteArray(0))
        }
        val handler = android.os.Handler(handlerThread.looper)
        val mimeType = try { api.get(id).mime } catch (e: Exception) { null }
            ?: "application/octet-stream"
        return ParcelFileDescriptor.open(
            tmp,
            ParcelFileDescriptor.parseMode(mode),
            handler
        ) { err ->
            try {
                if (err == null) { api.upload(id, tmp, mimeType); notifyChange(parentOf(id)) }
                else android.util.Log.w("TwakeDP", "write FD closed with error for $id", err)
            } catch (e: Exception) {
                android.util.Log.e("TwakeDP", "upload on close failed for $id", e)
            } finally { tmp.delete() }
        }
    }

    private val handlerThread by lazy {
        android.os.HandlerThread("twake-dp-write").apply { start() }
    }

    private fun parentOf(id: String): String =
        try { api.get(id).dirId ?: DocumentMapper.ROOT_DOC_ID } catch (e: Exception) { DocumentMapper.ROOT_DOC_ID }
```

- [ ] **Step 5: Run tests + build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*" && ./gradlew :app:assembleDebug`
Expected: PASS, BUILD SUCCESSFUL.

- [ ] **Step 6: Manual verify (edit-in-place)**

Open a `.txt` from Twake Drive in a text editor that supports editing SAF documents (e.g. Markor) → edit → save → reopen from the app → the new content and a new version are present.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/CozyStackApi.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/CozyStackApiTest.kt
git commit -m "feat(android): edit-in-place write-back on FD close

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Rename, move, delete + isChildDocument

Deliverable: rename/move/delete from any app, with move-conflict resolution mirroring the RN `moveEntry`.

**Files:**
- Modify: `CozyStackApi.kt` (`rename`, `move`, `trash`, `statByPath`)
- Modify: `TwakeDocumentsProvider.kt` (`renameDocument`, `moveDocument`, `deleteDocument`, `removeDocument`, `isChildDocument`)
- Modify: `CozyStackApiTest.kt`

**Interfaces:**
- Produces: `CozyStackApi.{rename, move, trash, statByPath}`; provider mutation methods.

- [ ] **Step 1: Write failing tests**

Append to `CozyStackApiTest.kt`:

```kotlin
    @Test fun `rename PATCHes the name attribute`() {
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"b.txt","size":"1"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val f = api.rename("f1", "b.txt")
        assertEquals("b.txt", f.name)
        val req = server.takeRequest()
        assertEquals("PATCH", req.method); assertEquals("/files/f1", req.path)
        assertTrue(req.body.readUtf8().contains("\"name\":\"b.txt\""))
    }

    @Test fun `move PATCHes the dir_id attribute`() {
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"1","dir_id":"dest"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val f = api.move("f1", "dest")
        assertEquals("dest", f.dirId)
        assertTrue(server.takeRequest().body.readUtf8().contains("\"dir_id\":\"dest\""))
    }

    @Test fun `trash DELETEs the file`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"1"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        api.trash("f1")
        val req = server.takeRequest()
        assertEquals("DELETE", req.method); assertEquals("/files/f1", req.path)
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*"`
Expected: FAIL — `rename`/`move`/`trash` unresolved.

- [ ] **Step 3: Implement the API methods**

```kotlin
    private fun patchAttributes(id: String, attrsJson: String): CozyFile {
        val payload = """{"data":{"type":"io.cozy.files","id":"$id","attributes":$attrsJson}}"""
        val body = payload.toRequestBody("application/vnd.api+json".toMediaTypeOrNull())
        val req = Request.Builder().url("${base()}/files/$id")
            .header("Accept", "application/vnd.api+json").patch(body).build()
        exec(req).use {
            val data = JSONObject(it.body!!.string()).getJSONObject("data")
            return CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
        }
    }

    fun rename(id: String, newName: String): CozyFile =
        patchAttributes(id, JSONObject().put("name", newName).toString())

    fun trash(id: String) {
        val req = Request.Builder().url("${base()}/files/$id")
            .header("Accept", "application/vnd.api+json").delete().build()
        exec(req).close()
    }

    fun statByPath(path: String): CozyFile? = try {
        val data = jsonGet("/files/metadata?Path=${enc(path)}").getJSONObject("data")
        CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
    } catch (e: FileNotFoundException) { null }

    fun move(id: String, targetParentId: String): CozyFile {
        val patch = JSONObject().put("dir_id", targetParentId).toString()
        try {
            return patchAttributes(id, patch)
        } catch (e: AuthRequiredException) {
            throw e // subclass of IOException — must be caught before the 409 handler
        } catch (e: IOException) {
            if (!e.message.orEmpty().contains("HTTP 409")) throw e
            // 409: trash the conflicting destination entry, then retry (mirrors moveEntry.ts).
            val moving = get(id)
            val destPath = get(targetParentId).path?.trimEnd('/') ?: throw e
            statByPath("$destPath/${moving.name}")?.let { trash(it.id) }
            return patchAttributes(id, patch)
        }
    }
```

Note: `exec` throws `IOException("HTTP 409 …")` for conflicts; `move` catches that message. Confirm `exec`'s message format matches (`"HTTP $c …"`).

- [ ] **Step 4: Implement provider mutation methods**

```kotlin
    override fun renameDocument(documentId: String?, displayName: String?): String? {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val f = api.rename(id, displayName ?: "untitled")
        notifyChange(f.dirId ?: DocumentMapper.ROOT_DOC_ID)
        return null // id is stable
    }

    override fun moveDocument(
        documentId: String?, sourceParentDocumentId: String?, targetParentDocumentId: String?
    ): String {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val target = targetParentDocumentId ?: throw java.io.FileNotFoundException("null target")
        api.move(id, target)
        sourceParentDocumentId?.let { notifyChange(it) }
        notifyChange(target)
        return id
    }

    override fun deleteDocument(documentId: String?) {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        val parent = parentOf(id)
        api.trash(id)
        notifyChange(parent)
    }

    override fun removeDocument(documentId: String?, parentDocumentId: String?) {
        val id = documentId ?: throw java.io.FileNotFoundException("null id")
        api.trash(id)
        notifyChange(parentDocumentId ?: parentOf(id))
    }

    override fun isChildDocument(parentDocumentId: String?, documentId: String?): Boolean {
        if (parentDocumentId == null || documentId == null) return false
        if (parentDocumentId == DocumentMapper.ROOT_DOC_ID) return true // single-root tree
        var current: String? = documentId
        var hops = 0
        while (current != null && hops++ < 64) {
            if (current == parentDocumentId) return true
            current = try { api.get(current).dirId } catch (e: Exception) { null }
        }
        return false
    }
```

- [ ] **Step 5: Run tests + build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*CozyStackApiTest*" && ./gradlew :app:assembleDebug`
Expected: PASS, BUILD SUCCESSFUL.

- [ ] **Step 6: Manual verify**

In the Files app on the Twake Drive root: rename a file; move a file between folders (incl. one that already has a same-named file → the conflicting one goes to trash and the move succeeds); delete a file (appears in the Drive trash).

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/CozyStackApi.kt \
  android/app/src/main/java/com/linagora/twakedrive/fileprovider/TwakeDocumentsProvider.kt \
  android/app/src/test/java/com/linagora/twakedrive/fileprovider/CozyStackApiTest.kt
git commit -m "feat(android): rename, move (with conflict resolution), and delete via SAF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: QA pass, module docs, and PR

Deliverable: an end-to-end QA checklist executed, a module README, and the PR opened against `feat/android-support`.

**Files:**
- Create: `android/app/src/main/java/com/linagora/twakedrive/fileprovider/README.md`
- Modify: `docs/superpowers/specs/2026-07-02-android-documents-provider-design.md` (flip status)

- [ ] **Step 1: Full unit-test + build gate**

Run: `cd android && ./gradlew :app:testDebugUnitTest && ./gradlew :app:assembleDebug` and `npm test`
Expected: all PASS, BUILD SUCCESSFUL.

- [ ] **Step 2: Execute the manual QA checklist** (record pass/fail in the PR body)

- Root visible in Files app; browse nested folders.
- Open a PDF from Gmail's attach picker.
- Image thumbnails render in the picker grid.
- `ACTION_CREATE_DOCUMENT` into Twake Drive from an editor.
- Create a folder from Files.
- Edit a `.txt` in place; new version lands on the stack.
- Rename, move (with and without a name conflict), delete.
- Airplane mode: a **pinned** file still opens; a non-pinned file fails cleanly (no crash).
- Log out in the app → root disappears from Files; log back in → it returns.

- [ ] **Step 3: Write the module README**

`android/app/src/main/java/com/linagora/twakedrive/fileprovider/README.md`:

```markdown
# Android DocumentsProvider (SAF)

Exposes the whole Twake Drive to Android's Storage Access Framework so any app
can browse/edit Drive files. Native Kotlin, runs outside the RN runtime.

- `TwakeDocumentsProvider` — SAF entry point (roots/children/open/create/rename/move/delete).
- `CozyStackApi` — OkHttp client over cozy-stack `io.cozy.files`; 401 → single-flight refresh.
- `SessionStore` + `EncryptedCredentialStore` — durable creds mirrored from the RN app
  (`src/native/twakeAuthBridge.ts`) into EncryptedSharedPreferences; provider mints its
  own access token from the shared refresh token.
- `DocumentMapper` — cozy JSON ⇄ SAF rows/flags. `DocumentCache` — cache + pinned-blob fast path.

Design: `docs/superpowers/specs/2026-07-02-android-documents-provider-design.md`.
Follow-ups: search, recents, "Shared with me" root, copy, incremental paging, iOS File Provider.
```

- [ ] **Step 4: Flip spec status**

Change the spec's status line to `**Status:** implemented (PR against feat/android-support).`

- [ ] **Step 5: Commit + push + open PR**

```bash
git add android/app/src/main/java/com/linagora/twakedrive/fileprovider/README.md \
  docs/superpowers/specs/2026-07-02-android-documents-provider-design.md
git commit -m "docs(android): DocumentsProvider module README + spec status

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u fork feat/android-documents-provider
gh pr create --base feat/android-support --head feat/android-documents-provider \
  --title "feat(android): DocumentsProvider — browse & edit the Drive from any app" \
  --body "Implements the Android SAF DocumentsProvider per docs/superpowers/specs/2026-07-02-android-documents-provider-design.md. Full R/W, live API + cache, single Twake Drive root. iOS File Provider is a follow-up.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review notes

- **Spec coverage:** roots/browse (T6) · open+thumbnails (T7) · create (T8) · write-back (T9) · rename/move/delete + isChild (T10) · session sharing + refresh (T3/T4) · cache + offline fast path (T7) · config plugin + manifest + gradle (T1) · tests (T2/T4/T5/T7–T10) · QA + docs (T11). Deferred items (search/recents/shared root/copy/paging/iOS) are explicitly out of v1 per spec §10.
- **Refresh-token rotation** (spec §11.1) is verified in T4 step 7 before relying on the stable-token assumption.
- **Write-back error surfacing** (spec §11.2): logged in T9; acceptable for v1.
- **New-Arch module** (spec §11.4): legacy `ReactPackage` registered in T3; if it fails to load under New Arch, fall back to a TurboModule/Expo module (note in PR).
