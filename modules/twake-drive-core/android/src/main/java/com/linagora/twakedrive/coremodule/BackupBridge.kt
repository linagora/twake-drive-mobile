package com.linagora.twakedrive.coremodule

import android.content.Context
import android.net.Network
import com.linagora.twakedrive.core.BackupStore
import com.linagora.twakedrive.core.CoreException
import com.linagora.twakedrive.core.HttpRequest
import com.linagora.twakedrive.core.HttpResponse
import com.linagora.twakedrive.core.StackClient
import com.linagora.twakedrive.core.StackTransport
import com.linagora.twakedrive.core.TokenSource
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** The session of the app, which the module cannot import: the app registers it at start. */
interface BackupSession {
  fun baseUrl(): String?
  fun accessToken(): String?
  /** A new access token, or null when the session is gone. */
  fun refresh(previous: String?): String?
}

object BackupHost {
  @Volatile var session: BackupSession? = null
}

private fun session(): BackupSession =
  BackupHost.session ?: throw CoreException.Stack("no session registered")

class AppTokenSource : TokenSource {
  override fun accessToken(): String =
    session().let { it.accessToken() ?: it.refresh(null) } ?: throw CoreException.Stack("not signed in")

  override fun refresh(rejected: String): String =
    session().refresh(rejected) ?: throw CoreException.Stack("not signed in")
}

/** Sends a request of the core, with `file` as its body for an upload, on `network` when given. */
fun exchange(request: HttpRequest, file: File? = null, network: Network? = null): HttpResponse {
  val connection = try {
    val url = URL(request.url)
    (network?.openConnection(url) ?: url.openConnection()) as HttpURLConnection
  } catch (e: Exception) {
    throw CoreException.Stack("invalid request URL")
  }
  try {
    connection.connectTimeout = 30_000
    connection.readTimeout = 60_000
    connection.requestMethod = request.method
    request.headers.forEach { connection.setRequestProperty(it.name, it.value) }
    val body = request.body
    when {
      file != null -> {
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(file.length())
        file.inputStream().use { input -> connection.outputStream.use { input.copyTo(it) } }
      }
      body != null -> {
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(body.size)
        connection.outputStream.use { it.write(body) }
      }
    }
    val status = connection.responseCode
    val stream = if (status >= 400) connection.errorStream else connection.inputStream
    return HttpResponse(status.toUShort(), stream?.use { it.readBytes() } ?: ByteArray(0))
  } catch (e: IOException) {
    // A socket read whole goes back to the pool; this one may not have been.
    connection.disconnect()
    // No URL or path in the reason: the core would pass it on as is.
    throw CoreException.Network(e.javaClass.simpleName)
  }
}

class UrlConnectionTransport : StackTransport {
  override fun send(request: HttpRequest): HttpResponse = exchange(request)
}

/** The file name of the backup state of an account: its host, letters, digits and dots only. */
fun accountName(baseUrl: String): String? =
  URL(baseUrl).host?.lowercase()?.map { if (it.isLetterOrDigit() || it == '.') it else '_' }?.joinToString("")

data class Backup(val client: StackClient, val store: BackupStore)

/**
 * The client of the signed-in account and its backup state, built on each use:
 * the account may have changed. The state stays out of the Android backup, as
 * one Drive folder goes with one phone.
 */
fun openBackup(context: Context): Backup {
  val baseUrl = session().baseUrl() ?: throw CoreException.Stack("not signed in")
  val account = accountName(baseUrl) ?: throw CoreException.Stack("not signed in")
  val folder = File(context.noBackupFilesDir, "backup").apply { mkdirs() }
  val path = File(folder, "$account.db").path
  val store = try {
    BackupStore.open(path)
  } catch (e: CoreException.Unusable) {
    listOf("", "-wal", "-shm").forEach { File(path + it).delete() }
    BackupStore.open(path)
  }
  return Backup(StackClient(baseUrl, UrlConnectionTransport(), AppTokenSource(), store), store)
}
