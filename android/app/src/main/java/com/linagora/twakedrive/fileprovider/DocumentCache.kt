package com.linagora.twakedrive.fileprovider

import android.content.Context
import java.io.File
import java.io.FileNotFoundException

class DocumentCache(private val context: Context) {

    private fun dir(): File = File(context.cacheDir, "fileprovider").apply { mkdirs() }

    /**
     * Turn a caller-supplied id into a file under [base], or refuse.
     *
     * [DocumentIds] already rules out every separator, so the canonical check
     * below never fires on its own — it is there to keep that guarantee local
     * to this file, rather than depending on a regex two files away.
     */
    private fun under(base: File, id: String, name: String = id): File {
        DocumentIds.require(id)
        val f = File(base, name)
        val root = base.canonicalPath
        if (!f.canonicalPath.startsWith(root + File.separator)) {
            throw FileNotFoundException("rejected document id")
        }
        return f
    }

    fun cachedFile(id: String): File = under(dir(), id)

    /** Read-only fast path over the RN-owned pinned offline blob. */
    fun offlineBlob(id: String): File? =
        under(File(context.filesDir, "offline"), id).takeIf { it.exists() }

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
        val tmp = under(dir(), id, "$id.dl")
        api.download(id, tmp)
        if (!tmp.renameTo(cached)) { tmp.copyTo(cached, overwrite = true); tmp.delete() }
        return cached
    }

    fun tempFor(id: String): File = under(dir(), id, "$id.${java.util.UUID.randomUUID()}.tmp")

    /** Stage just-written bytes into the content cache (fresh mtime) and drop the stale thumbnail. */
    fun stageWritten(id: String, src: File) {
        src.copyTo(cachedFile(id), overwrite = true)
        cachedFile("$id.thumb").delete()
    }
}
