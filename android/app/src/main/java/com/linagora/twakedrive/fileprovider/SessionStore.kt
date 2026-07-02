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
