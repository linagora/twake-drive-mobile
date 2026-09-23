package com.linagora.twakedrive.fileprovider

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class CozyFile(
    val id: String,
    val name: String,
    val isDir: Boolean,
    val dirId: String?,
    val size: Long,
    val mime: String?,
    val klass: String?,
    val updatedAt: Long,
    val path: String?,
    /**
     * Path of the thumbnail the stack signed for this file. It carries a secret,
     * so it cannot be rebuilt from the id (see the web client, which also reads
     * it off the document).
     */
    val thumbnailLink: String? = null
) {
    fun hasThumbnail(): Boolean = klass == "image"

    companion object {
        // SimpleDateFormat is not thread-safe; parseDate runs on concurrent binder
        // threads (list/get), so each thread gets its own formatter instance.
        private val iso = ThreadLocal.withInitial {
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        }

        private fun parseDate(s: String?): Long {
            if (s.isNullOrBlank()) return 0L
            return try { iso.get()!!.parse(s.substring(0, 19))?.time ?: 0L } catch (e: Exception) { 0L }
        }

        /** The `links` of a JSON-API document, preferring the size the picker shows. */
        private fun thumbnailLinkOf(links: JSONObject?): String? {
            if (links == null) return null
            for (size in arrayOf("medium", "small", "large", "tiny")) {
                val link = links.optString(size).ifBlank { null }
                if (link != null) return link
            }
            return null
        }

        fun fromDocument(node: JSONObject): CozyFile = fromAttributes(
            node.getString("id"),
            node.getJSONObject("attributes"),
            node.optJSONObject("links")
        )

        fun fromAttributes(id: String, a: JSONObject, links: JSONObject? = null): CozyFile {
            val isDir = a.optString("type") == "directory"
            return CozyFile(
                id = id,
                name = a.optString("name", ""),
                isDir = isDir,
                dirId = a.optString("dir_id").ifBlank { null },
                size = if (isDir) 0L else a.optString("size", "0").toLongOrNull() ?: 0L,
                mime = a.optString("mime").ifBlank { null },
                klass = a.optString("class").ifBlank { null },
                updatedAt = parseDate(a.optString("updated_at").ifBlank { null }),
                path = a.optString("path").ifBlank { null },
                thumbnailLink = thumbnailLinkOf(links)
            )
        }
    }
}
