package com.linagora.twakedrive.authbridge

import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.linagora.twakedrive.fileprovider.DocumentCache
import com.linagora.twakedrive.fileprovider.DocumentMapper
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
            // A picker left open while signed out gets its root back.
            reactApplicationContext.contentResolver.notifyChange(
                DocumentsContract.buildRootsUri(DocumentMapper.AUTHORITY), null)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SYNC_SESSION", e)
        }
    }

    @ReactMethod
    fun clearSession(promise: Promise) {
        try {
            session.clear()
            DocumentCache(reactApplicationContext).clear()
            // A grant on this account's tree would otherwise read the next account's drive.
            reactApplicationContext.revokeUriPermission(
                Uri.parse("content://${DocumentMapper.AUTHORITY}/"),
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            // DocumentsUI keeps the roots and any open listing until told they changed.
            val resolver = reactApplicationContext.contentResolver
            resolver.notifyChange(DocumentsContract.buildRootsUri(DocumentMapper.AUTHORITY), null)
            resolver.notifyChange(
                DocumentsContract.buildChildDocumentsUri(
                    DocumentMapper.AUTHORITY, DocumentMapper.ROOT_DOC_ID), null)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_CLEAR_SESSION", e)
        }
    }

    @ReactMethod
    fun isAppLinkUsable(promise: Promise) {
        try {
            promise.resolve(AppLinkState.isUsable(reactApplicationContext))
        } catch (e: Exception) {
            promise.reject("E_APP_LINK_STATE", e)
        }
    }
}
