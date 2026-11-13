package com.linagora.twakedrive.coremodule

import android.content.Context
import com.linagora.twakedrive.core.BackupConditions
import com.linagora.twakedrive.core.BackupConfig
import com.linagora.twakedrive.core.BackupStatus
import com.linagora.twakedrive.core.DeviceFolder
import com.linagora.twakedrive.core.md5File
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class TwakeDriveCoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("no context")

  override fun definition() = ModuleDefinition {
    Name("TwakeDriveCore")

    Events("onBackupProgress")

    AsyncFunction("md5File") { path: String -> md5File(path) }

    AsyncFunction("requestPhotoAccess") { promise: Promise ->
      val permissions = appContext.permissions ?: return@AsyncFunction promise.resolve(photoAccess(context))
      permissions.askForPermissions(
        PermissionsResponseListener { promise.resolve(photoAccess(context)) }, *photoPermissions().toTypedArray())
    }

    Function("photoAccess") { photoAccess(context) }

    AsyncFunction("deviceName") { deviceName(context) }

    AsyncFunction("listDeviceFolders") { promise: Promise ->
      onStack(promise) { openBackup(context).client.listDeviceFolders().map { it.record } }
    }

    AsyncFunction("adoptDeviceFolder") { folderId: String, deviceId: String, promise: Promise ->
      onStack(promise) { openBackup(context).client.adoptDeviceFolder(folderId, deviceId).record }
    }

    AsyncFunction("createDeviceFolder") { deviceId: String, deviceName: String, rootName: String, promise: Promise ->
      onStack(promise) { openBackup(context).client.createDeviceFolder(deviceId, deviceName, rootName).record }
    }

    AsyncFunction("runBackupPass") { folderId: String, deviceId: String, promise: Promise ->
      passStop.set(false)
      // A pass may last long: on its own thread, the folder choice stays usable.
      passQueue.execute {
        settle(promise) {
          BackupPass(context, BackupConfig(folderId, deviceId), { passStop.get() }) {
            sendEvent("onBackupProgress", it.record)
          }.run().record
        }
      }
    }

    /** The pass running ends after the media in progress. */
    Function("stopBackupPass") {
      passStop.set(true)
      passQueue.execute { runCatching { openBackup(context).store.clearBackupConfig() } }
    }

    AsyncFunction("backupStatus") { promise: Promise -> onStack(promise) { openBackup(context).store.status().record } }

    AsyncFunction("retryFailed") { promise: Promise -> onStack(promise) { openBackup(context).store.retryFailed() } }

    AsyncFunction("backupConditions") { promise: Promise ->
      onStack(promise) {
        openBackup(context).store.conditions().let {
          mapOf("cellularPhotos" to it.cellularPhotos, "cellularVideos" to it.cellularVideos, "onlyCharging" to it.onlyCharging)
        }
      }
    }

    AsyncFunction("setBackupConditions") { cellularPhotos: Boolean, cellularVideos: Boolean, onlyCharging: Boolean, promise: Promise ->
      onStack(promise) {
        openBackup(context).store.setConditions(BackupConditions(cellularPhotos, cellularVideos, onlyCharging))
      }
    }

    /** The albums of the phone are its MediaStore buckets, with the user's choice. */
    AsyncFunction("listAlbums") { promise: Promise ->
      onStack(promise) {
        val store = openBackup(context).store
        val choices = store.albumChoices().associate { it.albumId to it.included }
        val albums = queryMedia(context).filter { it.bucketId != null }.groupBy { it.bucketId!! }
        // With limited access some albums may not show: their choice stays.
        if (photoAccess(context) == "authorized") {
          (choices.keys - albums.keys).forEach { store.setAlbumChoice(it, null) }
        }
        albums.map { (id, media) ->
          buildMap {
            put("id", id)
            put("title", media.first().bucketName ?: "")
            put("count", media.size)
            choices[id]?.let { put("choice", if (it) "picked" else "leftOut") }
          }
        }
      }
    }

    AsyncFunction("setAlbumChoice") { albumId: String, choice: String?, promise: Promise ->
      onStack(promise) { openBackup(context).store.setAlbumChoice(albumId, choice?.let { it == "picked" }) }
    }
  }

  /** The stack calls wait on the network: off the threads Expo shares between modules. */
  private fun onStack(promise: Promise, body: () -> Any?) = stackQueue.execute { settle(promise, body) }

  private fun settle(promise: Promise, body: () -> Any?) {
    try {
      promise.resolve(body())
    } catch (e: Throwable) {
      // An Error left on the executor thread would kill the app: the core may fail to load.
      promise.reject(CodedException(e.message ?: e.javaClass.simpleName))
    }
  }
}

private val passStop = AtomicBoolean(false)
private val stackQueue = Executors.newSingleThreadExecutor()
private val passQueue = Executors.newSingleThreadExecutor()

val DeviceFolder.record: Map<String, Any>
  get() = mapOf("id" to id, "name" to name, "path" to path, "deviceIds" to deviceIds, "createdAt" to createdAt)

val BackupStatus.record: Map<String, Any?>
  get() = buildMap {
    put("done", counts.done.toInt())
    put("pending", counts.pending.toInt())
    put("skipped", counts.skipped.toInt())
    put("failed", counts.failed.toInt())
    put("unavailable", counts.unavailable.toInt())
    lastPassAt?.let { put("lastPassAt", it) }
    stoppedBy?.let { put("stoppedBy", it) }
  }
