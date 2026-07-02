package com.linagora.twakedrive.fileprovider

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

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

    private fun cozyFile(id: String) = CozyFile(
        id = id, name = "a.jpg", isDir = false, dirId = null,
        size = 0L, mime = "image/jpeg", klass = "image", updatedAt = 0L, path = null
    )

    @Test fun `thumbnail downloads the response body to dest on success`() {
        val body = "fake-thumbnail-bytes"
        server.enqueue(MockResponse().setBody(body))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val dest = File.createTempFile("thumb", ".dest").apply { delete() }

        val ok = api.thumbnail(cozyFile("f1"), dest)

        assertTrue(ok)
        assertTrue(dest.exists())
        assertArrayEquals(body.toByteArray(), dest.readBytes())
        assertEquals("/files/f1/thumbnails/medium", server.takeRequest().path)
    }

    @Test fun `a mid-stream failure does not leave a truncated file at dest`() {
        val body = "x".repeat(5000)
        server.enqueue(
            MockResponse().setBody(body).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY)
        )
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val dest = File.createTempFile("thumb", ".dest").apply { delete() }

        val ok = api.thumbnail(cozyFile("f2"), dest)

        assertFalse(ok)
        assertFalse("dest must not be left behind as a truncated/corrupt file", dest.exists())
    }

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

    @Test fun `upload PUTs new content to the file`() {
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"5","mime":"text/plain"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        val tmp = File.createTempFile("upload", null).apply { writeText("hello") }
        val f = api.upload("f1", tmp, "text/plain")
        assertEquals("f1", f.id)
        val req = server.takeRequest()
        assertEquals("PUT", req.method)
        assertEquals("/files/f1", req.path)
        assertEquals("hello", req.body.readUtf8())
    }
}
