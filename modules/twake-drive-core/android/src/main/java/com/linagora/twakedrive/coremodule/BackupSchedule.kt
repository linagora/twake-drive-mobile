package com.linagora.twakedrive.coremodule

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.linagora.twakedrive.core.BackupConditions
import com.linagora.twakedrive.core.BackupStatus
import com.linagora.twakedrive.core.R
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** One pass at a time, the app's or WorkManager's. */
internal val passQueue = Executors.newSingleThreadExecutor()
internal val passStop = AtomicBoolean(false)

/** What a pass of WorkManager waits for; the pass itself checks again for each media. */
fun constraints(conditions: BackupConditions): Constraints.Builder = Constraints.Builder()
  .setRequiredNetworkType(
    if (conditions.cellularPhotos || conditions.cellularVideos) NetworkType.CONNECTED else NetworkType.UNMETERED,
  )
  .setRequiresCharging(conditions.onlyCharging)
  .setRequiresBatteryNotLow(true)

/** The passes WorkManager starts: soon after a new media, and every hour. */
object BackupSchedule {
  internal const val MEDIA = "backup-media"
  private const val HOURLY = "backup-hourly"

  /** `policy` REPLACE puts new conditions on the media pass, at the cost of stopping one running. */
  fun schedule(context: Context, policy: ExistingWorkPolicy = ExistingWorkPolicy.KEEP) {
    val conditions = runCatching { openBackup(context).store.conditions() }.getOrNull() ?: return
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      HOURLY, ExistingPeriodicWorkPolicy.UPDATE,
      PeriodicWorkRequest.Builder(BackupWorker::class.java, 1, TimeUnit.HOURS)
        .setConstraints(constraints(conditions).build())
        .build(),
    )
    onNewMedia(context, conditions, policy)
  }

  /** A content trigger fires once: each media pass sets the next one. */
  internal fun onNewMedia(context: Context, conditions: BackupConditions, policy: ExistingWorkPolicy) {
    val trigger = constraints(conditions)
      .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
      .addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true)
      .setTriggerContentUpdateDelay(30, TimeUnit.SECONDS)
      .setTriggerContentMaxDelay(5, TimeUnit.MINUTES)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
      MEDIA, policy,
      OneTimeWorkRequest.Builder(BackupWorker::class.java).setConstraints(trigger).addTag(MEDIA).build(),
    )
  }

  fun cancel(context: Context) {
    WorkManager.getInstance(context).run {
      cancelUniqueWork(MEDIA)
      cancelUniqueWork(HOURLY)
    }
  }
}

class BackupWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  private fun stopped() = isStopped || passStop.get()

  // Behind a pass of the app, on the queue: the configuration and the stop are read when this pass runs.
  override fun doWork(): Result = passQueue.submit<Result> {
    val context = applicationContext
    val store = runCatching { openBackup(context).store }.getOrNull()
    // Signed out, or the backup turned off: WorkManager starts no pass any more.
    val config = store?.let { runCatching { it.backupConfig() }.getOrNull() }
    if (store == null || config == null) {
      BackupSchedule.cancel(context)
      return@submit Result.success()
    }
    if (stopped()) return@submit Result.success()
    // Android refuses a foreground service to an app in the background unless
    // it is exempt: the pass then has the ten minutes of a worker.
    val foreground = runCatching { setForegroundAsync(foregroundInfo(null)).get() }.isSuccess
    // Media added during a pass changed the library after its scan: one more pass reads them.
    var passes = 0
    do {
      val scanned = ScanToken.current(context)
      runCatching {
        BackupPass(context, config, ::stopped) { if (foreground) setForegroundAsync(foregroundInfo(it)) }.run()
      }
    } while (!stopped() && ++passes < 3 && scanned != null && ScanToken.current(context) != scanned)
    // WorkManager starts a stopped worker again: only a pass that ends sets the next media trigger,
    // appended so that it waits for this one; the hourly pass sets it again if it is gone.
    if (!stopped()) {
      runCatching {
        BackupSchedule.onNewMedia(
          context, store.conditions(),
          if (BackupSchedule.MEDIA in tags) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP,
        )
      }
    }
    Result.success()
  }.get()

  private val notification by lazy {
    val context = applicationContext
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(
          CHANNEL, context.getString(R.string.backup_notification_title), NotificationManager.IMPORTANCE_LOW,
        ),
      )
    }
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle(context.getString(R.string.backup_notification_title))
      .setContentIntent(open)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
  }

  private fun foregroundInfo(status: BackupStatus?): ForegroundInfo {
    val left = status?.counts?.pending?.toInt()
    val notification = notification
      .setContentText(left?.let { applicationContext.resources.getQuantityString(R.plurals.backup_notification_left, it, it) })
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      ForegroundInfo(NOTIFICATION_ID, notification)
    }
  }

  private companion object {
    const val CHANNEL = "backup"
    const val NOTIFICATION_ID = 4842
  }
}
