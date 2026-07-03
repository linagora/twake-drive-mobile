package com.linagora.twakedrive.fileprovider

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException

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
        val req = server.takeRequest()
        assertEquals("PATCH", req.method)
        assertEquals("/files/f1", req.path)
        assertTrue(req.body.readUtf8().contains("\"dir_id\":\"dest\""))
    }

    @Test fun `move resolves a 409 conflict by trashing the destination entry and retrying`() {
        server.enqueue(MockResponse().setResponseCode(409)) // first PATCH /files/f1
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt"}}}""")) // moving file
        server.enqueue(MockResponse().setBody("""{"data":{"id":"dest","type":"io.cozy.files","attributes":{"type":"directory","name":"Dest","path":"/Dest"}}}""")) // dest dir
        server.enqueue(MockResponse().setBody("""{"data":{"id":"conflict1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt"}}}""")) // conflict (statByPath)
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"data":{"id":"conflict1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt"}}}""")) // trash
        server.enqueue(MockResponse().setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","dir_id":"dest"}}}""")) // retry PATCH success
        api = CozyStackApi(sessionFor(server.url("/").toString()))

        val f = api.move("f1", "dest")

        assertEquals("dest", f.dirId)
        val r1 = server.takeRequest() // first PATCH -> 409
        assertEquals("PATCH", r1.method); assertEquals("/files/f1", r1.path)
        val r2 = server.takeRequest() // GET moving file
        assertEquals("GET", r2.method); assertEquals("/files/f1", r2.path)
        val r3 = server.takeRequest() // GET dest dir
        assertEquals("GET", r3.method); assertEquals("/files/dest", r3.path)
        val r4 = server.takeRequest() // statByPath the conflict
        assertEquals("GET", r4.method); assertTrue(r4.path!!.startsWith("/files/metadata?"))
        val r5 = server.takeRequest() // DELETE (trash) the conflict
        assertEquals("DELETE", r5.method); assertEquals("/files/conflict1", r5.path)
        val r6 = server.takeRequest() // retry PATCH
        assertEquals("PATCH", r6.method); assertEquals("/files/f1", r6.path)
    }

    @Test fun `move rethrows a non-409 error without attempting conflict resolution`() {
        server.enqueue(MockResponse().setResponseCode(500))
        api = CozyStackApi(sessionFor(server.url("/").toString()))

        assertThrows(IOException::class.java) { api.move("f1", "dest") }

        assertEquals(1, server.requestCount)
    }

    @Test(expected = AuthRequiredException::class)
    fun `an auth failure during move is rethrown as AuthRequiredException not routed to 409 handling`() {
        server.enqueue(MockResponse().setResponseCode(401)) // the PATCH
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"invalid_grant"}""")) // refresh fails
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        api.move("f1", "dest")
    }

    @Test fun `trash DELETEs the file`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"data":{"id":"f1","type":"io.cozy.files","attributes":{"type":"file","name":"a.txt","size":"1"}}}"""))
        api = CozyStackApi(sessionFor(server.url("/").toString()))
        api.trash("f1")
        val req = server.takeRequest()
        assertEquals("DELETE", req.method); assertEquals("/files/f1", req.path)
    }
}
