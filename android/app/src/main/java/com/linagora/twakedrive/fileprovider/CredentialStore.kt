package com.linagora.twakedrive.fileprovider

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

interface CredentialStore {
    fun getString(key: String): String?
    fun putAll(values: Map<String, String>)
    fun clear()
}

class EncryptedCredentialStore(private val context: Context) : CredentialStore {
    private var opened: SharedPreferences? = null

    private fun create(): SharedPreferences {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun prefs(): SharedPreferences = opened ?: try {
        create().also { opened = it }
    } catch (e: Exception) {
        Log.w(TAG, "credential store unreadable, starting a new one", e)
        recreate()
    }

    private fun recreate(): SharedPreferences {
        context.deleteSharedPreferences(PREFS_NAME)
        return create().also { opened = it }
    }

    override fun getString(key: String): String? = try {
        prefs().getString(key, null)
    } catch (e: Exception) {
        Log.w(TAG, "could not read a credential", e)
        null
    }

    override fun putAll(values: Map<String, String>) {
        val write = { p: SharedPreferences ->
            p.edit().apply { values.forEach { (k, v) -> putString(k, v) } }.apply()
        }
        try {
            write(prefs())
        } catch (e: Exception) {
            Log.w(TAG, "credential store unwritable, starting a new one", e)
            write(recreate())
        }
    }

    override fun clear() {
        try {
            prefs().edit().clear().apply()
        } catch (e: Exception) {
            Log.w(TAG, "could not clear the credential store", e)
            recreate()
        }
    }

    private companion object {
        const val PREFS_NAME = "twake_fileprovider_session"
        const val TAG = "TwakeCredentialStore"
    }
}
