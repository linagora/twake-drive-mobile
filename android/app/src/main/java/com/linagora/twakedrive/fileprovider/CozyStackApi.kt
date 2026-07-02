package com.linagora.twakedrive.fileprovider

import okhttp3.Authenticator
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

class AuthRequiredException(msg: String) : IOException(msg)

class CozyStackApi(private val session: SessionStore) {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(session))
        .authenticator(TokenAuthenticator(session))
        .build()

    private class AuthInterceptor(private val s: SessionStore) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val req = chain.request()
            if (req.header("Authorization") != null) return chain.proceed(req)
            val token = s.accessToken()
            val authed = if (token != null)
                req.newBuilder().header("Authorization", "Bearer $token").build() else req
            return chain.proceed(authed)
        }
    }

    private class TokenAuthenticator(private val s: SessionStore) : Authenticator {
        override fun authenticate(route: Route?, response: Response): Request? {
            if (responseCount(response) >= 2) return null // already retried once
            val previous = response.request.header("Authorization")?.removePrefix("Bearer ")
            val fresh = s.refreshAccessToken(previous) ?: return null
            return response.request.newBuilder()
                .header("Authorization", "Bearer $fresh").build()
        }
        private fun responseCount(response: Response): Int {
            var r: Response? = response; var n = 1
            while (r?.priorResponse != null) { n++; r = r.priorResponse }
            return n
        }
    }

    private fun base(): String =
        session.baseUri() ?: throw AuthRequiredException("no session")

    private fun exec(req: Request): Response {
        val resp = client.newCall(req).execute()
        when {
            resp.isSuccessful -> return resp
            resp.code == 401 -> { resp.close(); throw AuthRequiredException("unauthorized") }
            resp.code == 404 -> { resp.close(); throw FileNotFoundException(req.url.encodedPath) }
            else -> { val c = resp.code; resp.close(); throw IOException("HTTP $c ${req.url.encodedPath}") }
        }
    }

    private fun jsonGet(path: String): JSONObject {
        val req = Request.Builder().url("${base()}$path")
            .header("Accept", "application/vnd.api+json").build()
        exec(req).use { return JSONObject(it.body!!.string()) }
    }

    fun get(id: String): CozyFile {
        val data = jsonGet("/files/$id").getJSONObject("data")
        return CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
    }

    fun list(dirId: String, cap: Int = 500): List<CozyFile> {
        val out = ArrayList<CozyFile>()
        var path: String? = "/files/$dirId"
        var pages = 0
        while (path != null && out.size < cap) {
            val json = jsonGet(path)
            val included = json.optJSONArray("included") ?: break
            for (i in 0 until included.length()) {
                val node = included.getJSONObject(i)
                val id = node.getString("id")
                if (id in DocumentMapper.HIDDEN_IDS) continue
                out.add(CozyFile.fromAttributes(id, node.getJSONObject("attributes")))
            }
            val next = json.optJSONObject("links")?.optString("next").orEmpty()
            path = if (next.isBlank()) null else next.substringAfter(base()).ifBlank { next }
            if (++pages > 50) { android.util.Log.w("TwakeDP", "list($dirId) truncated at $pages pages"); break }
        }
        if (out.size >= cap) android.util.Log.w("TwakeDP", "list($dirId) hit cap=$cap")
        return out
    }

    fun download(id: String, dest: File) {
        val req = Request.Builder().url("${base()}/files/download/$id").build()
        exec(req).use { resp ->
            dest.parentFile?.mkdirs()
            dest.outputStream().use { out -> resp.body!!.byteStream().copyTo(out) }
        }
    }

    fun thumbnail(file: CozyFile, dest: File): Boolean {
        // cozy-stack exposes thumbnails via the file's medium link; fetch it directly.
        val url = "${base()}/files/${file.id}/thumbnails/medium"
        val req = Request.Builder().url(url).build()
        // Stage to a temp file and only rename into place on full success, so a
        // mid-stream failure (dropped connection, etc.) never leaves a truncated
        // file at `dest` — mirrors DocumentCache.ensureLocal's download pattern.
        val tmp = File(dest.parentFile, dest.name + ".dl")
        return try {
            exec(req).use { resp ->
                dest.parentFile?.mkdirs()
                tmp.outputStream().use { out -> resp.body!!.byteStream().copyTo(out) }
            }
            if (!tmp.renameTo(dest)) { tmp.copyTo(dest, overwrite = true); tmp.delete() }
            true
        } catch (e: IOException) {
            tmp.delete()
            dest.delete()
            false
        }
    }

    private fun postForFile(pathAndQuery: String, body: okhttp3.RequestBody): CozyFile {
        val req = Request.Builder().url("${base()}$pathAndQuery")
            .header("Accept", "application/vnd.api+json").post(body).build()
        exec(req).use {
            val data = JSONObject(it.body!!.string()).getJSONObject("data")
            return CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
        }
    }

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    fun createDirectory(parentId: String, name: String): CozyFile =
        postForFile("/files/$parentId?Type=directory&Name=${enc(name)}",
            ByteArray(0).toRequestBody(null))

    fun createFile(parentId: String, name: String, mime: String): CozyFile =
        postForFile("/files/$parentId?Type=file&Name=${enc(name)}",
            ByteArray(0).toRequestBody(mime.toMediaTypeOrNull()))

    // Upload/rename/move/trash and statByPath land in Tasks 9–11.
}
