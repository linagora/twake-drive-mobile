package com.linagora.twakedrive.fileprovider

import androidx.test.core.app.ApplicationProvider
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.io.FileNotFoundException

@RunWith(RobolectricTestRunner::class)
class DocumentCacheTest {
    private val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()

    // Neither ensureLocal branch under test below reaches api.download(); this just
    // satisfies the parameter type (mirrors the pattern in CozyStackApiTest).
    private fun fakeApi(): CozyStackApi = CozyStackApi(SessionStore(FakeCredentialStore(), OkHttpClient()))

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

    @Test fun `stageWritten copies bytes into the content cache and drops the thumb`() {
        val cache = DocumentCache(ctx)
        val thumb = cache.cachedFile("x.thumb").apply { parentFile?.mkdirs(); writeText("old thumb") }
        assertTrue(thumb.exists())
        val src = File(ctx.cacheDir, "incoming-write").apply { writeText("new content") }

        cache.stageWritten("x", src)

        assertEquals("new content", cache.cachedFile("x").readText())
        assertTrue(!thumb.exists())
    }

    @Test fun `ensureLocal prefers a content-cache entry newer than the pinned blob`() {
        val cache = DocumentCache(ctx)
        val now = System.currentTimeMillis()
        val blob = File(ctx.filesDir, "offline/y").apply { parentFile?.mkdirs(); writeText("blob bytes") }
        blob.setLastModified(now - 60_000)
        val cached = cache.cachedFile("y").apply { parentFile?.mkdirs(); writeText("cache bytes") }
        cached.setLastModified(now)

        val result = cache.ensureLocal("y", fakeApi())

        assertEquals(cached, result)
        assertEquals("cache bytes", result.readText())
    }

    @Test fun `ensureLocal falls back to the pinned blob when it is newer or the only entry`() {
        val cache = DocumentCache(ctx)
        val now = System.currentTimeMillis()
        val blob = File(ctx.filesDir, "offline/z").apply { parentFile?.mkdirs(); writeText("blob bytes") }
        blob.setLastModified(now)

        // No content-cache entry at all yet: falls back to the blob.
        val onlyBlobResult = cache.ensureLocal("z", fakeApi())
        assertEquals(blob, onlyBlobResult)
        assertEquals("blob bytes", onlyBlobResult.readText())

        // A content-cache entry exists but is older than the blob: blob still wins.
        val staleCached = cache.cachedFile("z").apply { parentFile?.mkdirs(); writeText("stale cache bytes") }
        staleCached.setLastModified(now - 60_000)
        val blobStillWinsResult = cache.ensureLocal("z", fakeApi())
        assertEquals(blob, blobStillWinsResult)
        assertEquals("blob bytes", blobStillWinsResult.readText())
    }

    // A documentId reaches us from another app over Binder. Every entry point that
    // turns one into a path has to refuse the ones that name a path.
    @Test fun `cachedFile refuses an id that climbs out of the cache dir`() {
        assertThrows(FileNotFoundException::class.java) {
            DocumentCache(ctx).cachedFile("../../databases/twake.db")
        }
    }

    @Test fun `offlineBlob refuses an id that climbs out of the offline dir`() {
        val outside = File(ctx.filesDir, "../databases/twake.db")
            .apply { parentFile?.mkdirs(); writeText("private") }
        assertTrue(outside.exists())
        assertThrows(FileNotFoundException::class.java) {
            DocumentCache(ctx).offlineBlob("../databases/twake.db")
        }
    }

    @Test fun `ensureLocal refuses a traversing id before it reaches the network`() {
        assertThrows(FileNotFoundException::class.java) {
            DocumentCache(ctx).ensureLocal("../../databases/twake.db", fakeApi())
        }
    }

    @Test fun `tempFor refuses a traversing id`() {
        assertThrows(FileNotFoundException::class.java) {
            DocumentCache(ctx).tempFor("../../databases/twake.db")
        }
    }

    @Test fun `stageWritten refuses a traversing id`() {
        val src = File(ctx.cacheDir, "staged").apply { writeText("bytes") }
        assertThrows(FileNotFoundException::class.java) {
            DocumentCache(ctx).stageWritten("../../databases/twake.db", src)
        }
    }
}
