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

    // --- Additional coverage requested in Task 2 review ---

    @Test fun `clear makes accessToken null after a token was set`() {
        val fake = FakeCredentialStore()
        fake.map[SessionStore.KEY_ACCESS_TOKEN] = "AT"
        val s = SessionStore(fake, OkHttpClient())
        s.saveSession("https://a", "c", "s", "r")
        assertEquals("AT", s.accessToken())

        s.clear()

        assertNull(s.accessToken())
    }

    @Test fun `saveSession trims a trailing slash from the uri`() {
        val s = store()
        s.saveSession("https://alice.mycozy.cloud/", "cid", "secret", "rt")

        assertEquals("https://alice.mycozy.cloud", s.creds()!!.uri)
        assertEquals("https://alice.mycozy.cloud", s.baseUri())
    }
}
