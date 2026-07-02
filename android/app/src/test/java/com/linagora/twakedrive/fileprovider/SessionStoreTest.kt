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
