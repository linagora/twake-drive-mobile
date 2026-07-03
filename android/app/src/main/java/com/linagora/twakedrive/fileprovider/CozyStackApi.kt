package com.linagora.twakedrive.fileprovider

import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
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

    // A DocumentsProvider runs on binder threads; a strict caller can propagate its
    // StrictMode network policy across binder, turning our (legitimate, off-UI)
    // synchronous HTTP into a NetworkOnMainThreadException. Run network under a lax
    // policy so a propagated policy can't false-positive.
    //
    // android.os.StrictMode isn't mocked under CozyStackApiTest's plain-JUnit harness
    // (no Robolectric shadow; returnDefaultValues=false), so getThreadPolicy/
    // setThreadPolicy throw "not mocked" there. Guard the policy swap: on a real
    // device it always succeeds and the catch is unreachable; under that test it
    // falls back to running block() with no policy change (the pre-fix behavior),
    // keeping the wrapper transparent to the existing regression suite.
    private fun <T> onNetwork(block: () -> T): T {
        val previous = try {
            val policy = android.os.StrictMode.getThreadPolicy()
            android.os.StrictMode.setThreadPolicy(android.os.StrictMode.ThreadPolicy.LAX)
            policy
        } catch (e: RuntimeException) {
            null
        }
        return try {
            block()
        } finally {
            if (previous != null) android.os.StrictMode.setThreadPolicy(previous)
        }
    }

    private fun jsonGet(path: String): JSONObject {
        return onNetwork {
            val req = Request.Builder().url("${base()}$path")
                .header("Accept", "application/vnd.api+json").build()
            exec(req).use { return@onNetwork JSONObject(it.body!!.string()) }
        }
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
        onNetwork {
            val req = Request.Builder().url("${base()}/files/download/$id").build()
            exec(req).use { resp ->
                dest.parentFile?.mkdirs()
                dest.outputStream().use { out -> resp.body!!.byteStream().copyTo(out) }
            }
        }
    }

    fun thumbnail(file: CozyFile, dest: File): Boolean {
        return onNetwork {
            // cozy-stack exposes thumbnails via the file's medium link; fetch it directly.
            val url = "${base()}/files/${file.id}/thumbnails/medium"
            val req = Request.Builder().url(url).build()
            // Stage to a temp file and only rename into place on full success, so a
            // mid-stream failure (dropped connection, etc.) never leaves a truncated
            // file at `dest` — mirrors DocumentCache.ensureLocal's download pattern.
            val tmp = File(dest.parentFile, dest.name + ".dl")
            try {
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
    }

    private fun postForFile(pathAndQuery: String, body: okhttp3.RequestBody): CozyFile {
        return onNetwork {
            val req = Request.Builder().url("${base()}$pathAndQuery")
                .header("Accept", "application/vnd.api+json").post(body).build()
            exec(req).use {
                val data = JSONObject(it.body!!.string()).getJSONObject("data")
                return@onNetwork CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
            }
        }
    }

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    fun createDirectory(parentId: String, name: String): CozyFile =
        postForFile("/files/$parentId?Type=directory&Name=${enc(name)}",
            ByteArray(0).toRequestBody(null))

    fun createFile(parentId: String, name: String, mime: String): CozyFile =
        postForFile("/files/$parentId?Type=file&Name=${enc(name)}",
            ByteArray(0).toRequestBody(mime.toMediaTypeOrNull()))

    fun upload(id: String, src: File, mime: String): CozyFile {
        return onNetwork {
            val body = src.asRequestBody(mime.toMediaTypeOrNull())
            val req = Request.Builder().url("${base()}/files/$id")
                .header("Accept", "application/vnd.api+json").put(body).build()
            exec(req).use {
                val data = JSONObject(it.body!!.string()).getJSONObject("data")
                return@onNetwork CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
            }
        }
    }

    private fun patchAttributes(id: String, attrsJson: String): CozyFile {
        return onNetwork {
            val payload = """{"data":{"type":"io.cozy.files","id":"$id","attributes":$attrsJson}}"""
            val body = payload.toRequestBody("application/vnd.api+json".toMediaTypeOrNull())
            val req = Request.Builder().url("${base()}/files/$id")
                .header("Accept", "application/vnd.api+json").patch(body).build()
            exec(req).use {
                val data = JSONObject(it.body!!.string()).getJSONObject("data")
                return@onNetwork CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
            }
        }
    }

    fun rename(id: String, newName: String): CozyFile =
        patchAttributes(id, JSONObject().put("name", newName).toString())

    fun trash(id: String) {
        onNetwork {
            val req = Request.Builder().url("${base()}/files/$id")
                .header("Accept", "application/vnd.api+json").delete().build()
            exec(req).close()
        }
    }

    fun statByPath(path: String): CozyFile? = try {
        val data = jsonGet("/files/metadata?Path=${enc(path)}").getJSONObject("data")
        CozyFile.fromAttributes(data.getString("id"), data.getJSONObject("attributes"))
    } catch (e: FileNotFoundException) { null }

    fun move(id: String, targetParentId: String): CozyFile {
        val patch = JSONObject().put("dir_id", targetParentId).toString()
        try {
            return patchAttributes(id, patch)
        } catch (e: AuthRequiredException) {
            throw e // subclass of IOException — must be caught before the 409 handler
        } catch (e: IOException) {
            if (!e.message.orEmpty().contains("HTTP 409")) throw e
            // 409: trash the conflicting destination entry, then retry (mirrors moveEntry.ts).
            val moving = get(id)
            val destPath = get(targetParentId).path?.trimEnd('/') ?: throw e
            statByPath("$destPath/${moving.name}")?.let { trash(it.id) }
            return patchAttributes(id, patch)
        }
    }
}
