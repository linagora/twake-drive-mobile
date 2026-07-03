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
    val path: String?
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

        fun fromAttributes(id: String, a: JSONObject): CozyFile {
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
                path = a.optString("path").ifBlank { null }
            )
        }
    }
}
