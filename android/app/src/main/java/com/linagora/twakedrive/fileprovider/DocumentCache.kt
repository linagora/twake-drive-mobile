package com.linagora.twakedrive.fileprovider

import android.content.Context
import java.io.File

class DocumentCache(private val context: Context) {

    private fun dir(): File = File(context.cacheDir, "fileprovider").apply { mkdirs() }

    fun cachedFile(id: String): File = File(dir(), id)

    /** Read-only fast path over the RN-owned pinned offline blob. */
    fun offlineBlob(id: String): File? =
        File(context.filesDir, "offline/$id").takeIf { it.exists() }

    /**
     * A local, readable copy: pinned blob if present, else download to cache.
     *
     * A SAF write-back stages fresh bytes into the content cache (see [stageWritten])
     * without touching the RN-owned pinned blob, so a newer content-cache entry wins
     * over the blob — otherwise a pinned file's edits would never be visible here.
     */
    fun ensureLocal(id: String, api: CozyStackApi): File {
        val cached = cachedFile(id)
        offlineBlob(id)?.let { blob ->
            if (cached.exists() && cached.length() > 0 && cached.lastModified() >= blob.lastModified()) return cached
            return blob
        }
        if (cached.exists() && cached.length() > 0) return cached
        val tmp = File(dir(), "$id.dl")
        api.download(id, tmp)
        if (!tmp.renameTo(cached)) { tmp.copyTo(cached, overwrite = true); tmp.delete() }
        return cached
    }

    fun tempFor(id: String): File = File(dir(), "$id.${java.util.UUID.randomUUID()}.tmp")

    /** Stage just-written bytes into the content cache (fresh mtime) and drop the stale thumbnail. */
    fun stageWritten(id: String, src: File) {
        src.copyTo(cachedFile(id), overwrite = true)
        cachedFile("$id.thumb").delete()
    }
}
