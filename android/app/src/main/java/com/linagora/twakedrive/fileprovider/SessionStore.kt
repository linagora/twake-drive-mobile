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

    fun accessToken(): String? = store.getString(KEY_ACCESS_TOKEN)?.ifBlank { null }

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
}
