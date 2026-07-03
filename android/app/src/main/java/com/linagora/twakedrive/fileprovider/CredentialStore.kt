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
