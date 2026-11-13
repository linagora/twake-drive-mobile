package com.linagora.twakedrive.coremodule

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.MediaStore
import com.linagora.twakedrive.core.BackupConfig
import com.linagora.twakedrive.core.BackupStatus
import com.linagora.twakedrive.core.CoreException
import com.linagora.twakedrive.core.MediaToSend
import com.linagora.twakedrive.core.PassAction
import com.linagora.twakedrive.core.QueuedMedia
import com.linagora.twakedrive.core.UploadOutcome
import com.linagora.twakedrive.core.UploadPlan
import com.linagora.twakedrive.core.UploadReply
import com.linagora.twakedrive.core.md5File
import java.io.File
import java.util.UUID

/** One pass of the photo backup in the foreground: the core decides what to send and reads the answers. */
class BackupPass(
  private val context: Context,
  private val config: BackupConfig,
  private val isCancelled: () -> Boolean,
  private val onProgress: (BackupStatus) -> Unit,
) {
  private val backup = openBackup(context)
  private val client = backup.client
  private val store = backup.store
  private val exportFolder = File(context.cacheDir, "backup-export")
  /** Media of this pass held back for mobile data. */
  private val heldBack = mutableListOf<String>()

  fun run(): BackupStatus {
    // Without access MediaStore answers no rows: every media would look gone and be forgotten.
    val access = photoAccess(context)
    if (access == "denied") throw CoreException.Io("no access to the photo library")
    store.setBackupConfig(config)
    if (store.conditions().onlyCharging && !isCharging()) {
      store.waitFor("WaitingForPower")
      report()
      return store.status()
    }
    // A pass killed mid-upload leaves its copy behind; nothing is in flight in the foreground.
    exportFolder.deleteRecursively()
    exportFolder.mkdirs()
    // First: a short call, which also refreshes a token a 401 left expired.
    client.syncFolderIndex(config.folderId)
    scanLibrary(full = access == "authorized")
    store.beginPass()
    report()
    var cancelled = false
    pass@ while (true) {
      if (isCancelled()) {
        cancelled = true
        break
      }
      val batch = store.nextBatch(now(), 16u, 600L)
      if (batch.isEmpty()) break
      for (queued in batch) {
        if (isCancelled()) {
          cancelled = true
          break@pass
        }
        val action = send(queued)
        report()
        if (action == PassAction.STOP) break@pass
      }
    }
    if (heldBack.isNotEmpty()) {
      store.releaseMedia(heldBack)
      store.waitFor("WaitingForWifi")
    }
    if (!cancelled) store.endPass(now())
    report()
    return store.status()
  }

  private fun report() {
    val status = runCatching { store.status() }.getOrNull() ?: return
    onProgress(status)
  }

  /**
   * Only what changed since the last pass when MediaStore says (API 30+), the
   * whole library otherwise; with albums chosen, their media whole each time.
   */
  private fun scanLibrary(full: Boolean) {
    val choices = store.albumChoices()
    if (choices.isNotEmpty()) {
      val media = inAlbums(queryMedia(context), choices)
      store.recordLibrary(media.map { it.toLibrary() })
      store.keepOnly(media.map { it.localId })
      return
    }
    // Media the user adds to a limited selection keep their generation: the
    // selection is small, it is read whole each time.
    val current = ScanToken.current(context)?.takeIf { full }
    val saved = ScanToken.decode(store.changeToken())
    val since = saved?.takeIf { current != null && it.version == current.version }?.generation
    // shortcut: media deleted from the phone leave the queue when a pass meets
    // them (forget_media), saved ones stay counted; a full read could drop them.
    store.recordLibrary(queryMedia(context, since).map { it.toLibrary() })
    current?.let { store.setChangeToken(it.encode()) }
  }

  private fun send(queued: QueuedMedia): PassAction {
    val uri = Uri.parse(queued.localId)
    val media = queryMedia(context, ids = listOf(uri.lastPathSegment?.toLongOrNull() ?: -1)).firstOrNull()
    if (media == null) {
      store.forgetMedia(queued.localId)
      return PassAction.CONTINUE
    }
    val cellular = store.conditions().let { if (media.isVideo) it.cellularVideos else it.cellularPhotos }
    // Bound to the unmetered network, an upload fails when it drops instead of going on over mobile data.
    val network = if (cellular) null else unmeteredNetwork() ?: return holdBack(queued)
    // An md5 from a pass cut short: its content may be in Drive already.
    queued.md5?.let { if (client.alreadyThere(queued.localId, it, now()) != null) return PassAction.CONTINUE }
    val file = try {
      export(uri)
    } catch (e: Exception) {
      store.recordUnavailable(queued.localId, queued.modifiedAt, now())
      return PassAction.CONTINUE
    }
    try {
      val md5 = md5File(file.path)
      if (md5 != queued.md5) store.setMd5(queued.localId, queued.modifiedAt, md5)
      val toSend = MediaToSend(
        queued.localId, media.name, media.mime, file.length().toULong(), md5, media.createdAt,
        queued.modifiedAt, null,
      )
      var nameAttempt = 0u
      while (true) {
        val plan = client.prepareUpload(config.folderId, config.deviceId, toSend, nameAttempt, now())
        val request = (plan as? UploadPlan.Send)?.request ?: return PassAction.CONTINUE
        val response = try {
          exchange(request, file, network)
        } catch (e: CoreException.Network) {
          if (network != null && unmeteredNetwork() == null) return holdBack(queued)
          return store.recordOutcome(queued.localId, md5, UploadOutcome.Network, now())
        }
        when (val reply = client.readUploadResponse(toSend, nameAttempt, response.status, response.body, now())) {
          is UploadReply.NameTaken -> nameAttempt++
          is UploadReply.FileGone -> nameAttempt = 0u
          is UploadReply.Recorded -> return reply.action
        }
      }
    } finally {
      file.delete()
    }
  }

  private fun export(uri: Uri): File {
    val file = File(exportFolder, UUID.randomUUID().toString())
    try {
      // The original needs ACCESS_MEDIA_LOCATION; without it, the copy has no location.
      val input = (
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          runCatching { context.contentResolver.openInputStream(MediaStore.setRequireOriginal(uri)) }.getOrNull()
        } else {
          null
        }
        ) ?: context.contentResolver.openInputStream(uri) ?: throw CoreException.Io("no stream")
      input.use { stream -> file.outputStream().use { stream.copyTo(it) } }
      return file
    } catch (e: Exception) {
      file.delete()
      throw e
    }
  }

  /** Waits for an unmetered network, with no try counted. */
  private fun holdBack(queued: QueuedMedia): PassAction {
    heldBack += queued.localId
    return PassAction.CONTINUE
  }

  private fun unmeteredNetwork(): Network? {
    val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return null
    return connectivity.activeNetwork?.takeIf {
      connectivity.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true
    }
  }

  /** Plugged in, full or held below full included. */
  private fun isCharging(): Boolean =
    (context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      ?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
}

fun now(): Long = System.currentTimeMillis() / 1000
