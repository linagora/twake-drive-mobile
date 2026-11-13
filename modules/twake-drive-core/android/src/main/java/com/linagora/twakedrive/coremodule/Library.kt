package com.linagora.twakedrive.coremodule

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.MediaStore.Files.FileColumns
import com.linagora.twakedrive.core.AlbumChoice
import com.linagora.twakedrive.core.AlbumMedia
import com.linagora.twakedrive.core.LibraryMedia

data class PhoneMedia(
  val localId: String,
  val name: String,
  val mime: String,
  val createdAt: Long,
  val modifiedAt: Long,
  val bucketId: String?,
  val bucketName: String?,
) {
  val isVideo get() = mime.startsWith("video/")

  /** DATE_MODIFIED moves with an edit, not with a favorite: it is the version. */
  fun toLibrary() = LibraryMedia(localId, createdAt, modifiedAt, null, null)
}

private val FILES = MediaStore.Files.getContentUri("external")
private const val MEDIA_SELECTION =
  "${FileColumns.MEDIA_TYPE} IN (${FileColumns.MEDIA_TYPE_IMAGE}, ${FileColumns.MEDIA_TYPE_VIDEO})"

/** Also the id of the media in the backup state. */
private fun contentUri(id: Long, isVideo: Boolean): Uri = ContentUris.withAppendedId(
  if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)

/** `sinceGeneration` narrows the read to the media changed since, on API 30+ only. */
fun queryMedia(context: Context, sinceGeneration: Long? = null, ids: List<Long>? = null): List<PhoneMedia> {
  val columns = arrayOf(
    FileColumns._ID, FileColumns.DISPLAY_NAME, FileColumns.MIME_TYPE, FileColumns.DATE_ADDED,
    FileColumns.DATE_MODIFIED, MediaStore.MediaColumns.DATE_TAKEN, MediaStore.MediaColumns.BUCKET_ID,
    MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
  )
  var selection = MEDIA_SELECTION
  val args = mutableListOf<String>()
  if (sinceGeneration != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
    selection += " AND ${MediaStore.MediaColumns.GENERATION_MODIFIED} > ?"
    args += sinceGeneration.toString()
  }
  if (ids != null) selection += " AND ${FileColumns._ID} IN (${ids.joinToString(",")})"
  val media = mutableListOf<PhoneMedia>()
  context.contentResolver.query(FILES, columns,selection, args.toTypedArray(), null)?.use { c ->
    while (c.moveToNext()) {
      val mime = c.getString(2) ?: continue
      val added = c.getLong(3)
      val modified = if (c.isNull(4)) added else c.getLong(4)
      val taken = if (c.isNull(5)) null else (c.getLong(5) / 1000).takeIf { it > 0 }
      media += PhoneMedia(
        localId = contentUri(c.getLong(0), mime.startsWith("video/")).toString(),
        name = c.getString(1) ?: "media",
        mime = mime,
        createdAt = taken ?: added,
        modifiedAt = modified,
        bucketId = c.getString(6),
        bucketName = c.getString(7),
      )
    }
  }
  return media
}

/** The media of the albums picked, or of the whole library when none is, less those of the albums left out. */
fun inAlbums(media: List<PhoneMedia>, choices: List<AlbumChoice>): List<PhoneMedia> {
  // An album picked then emptied is gone from MediaStore: it picks nothing any more.
  val picked = choices.filter { it.included }.map { it.albumId }.toSet() intersect media.map { it.bucketId }.toSet()
  val leftOut = choices.filter { !it.included }.map { it.albumId }.toSet()
  return media.filter { (picked.isEmpty() || it.bucketId in picked) && it.bucketId !in leftOut }
}

/** The albums the user picked, with their media, for Drive Photos. */
fun pickedAlbums(media: List<PhoneMedia>, choices: List<AlbumChoice>): List<AlbumMedia> {
  val picked = choices.filter { it.included }.map { it.albumId }.toSet()
  return media.filter { it.bucketId in picked }.groupBy { it.bucketId!! }.map { (id, inAlbum) ->
    AlbumMedia(id, inAlbum.first().bucketName ?: "", inAlbum.map { it.localId })
  }
}

/** Where a scan stopped: MediaStore generations hold within one version of the volume. */
data class ScanToken(val version: String, val generation: Long) {
  fun encode(): ByteArray = "$version|$generation".toByteArray()

  companion object {
    fun decode(bytes: ByteArray?): ScanToken? {
      val (version, generation) = bytes?.toString(Charsets.UTF_8)?.split('|')?.takeIf { it.size == 2 } ?: return null
      return generation.toLongOrNull()?.let { ScanToken(version, it) }
    }

    fun current(context: Context): ScanToken? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        ScanToken(
          MediaStore.getVersion(context, MediaStore.VOLUME_EXTERNAL),
          MediaStore.getGeneration(context, MediaStore.VOLUME_EXTERNAL),
        )
      } else {
        null
      }
  }
}

fun photoPermissions(): List<String> = when {
  Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> listOf(
    Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
    Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED, Manifest.permission.ACCESS_MEDIA_LOCATION,
  )
  Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> listOf(
    Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
    Manifest.permission.ACCESS_MEDIA_LOCATION,
  )
  Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> listOf(
    Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION,
  )
  else -> listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
}

/** "authorized", "limited" (the user picked some media, Android 14+) or "denied". */
fun photoAccess(context: Context): String {
  fun granted(permission: String) = context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  return when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      granted(Manifest.permission.READ_MEDIA_IMAGES) && granted(Manifest.permission.READ_MEDIA_VIDEO) -> "authorized"
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && granted(Manifest.permission.READ_EXTERNAL_STORAGE) ->
      "authorized"
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
      granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) -> "limited"
    else -> "denied"
  }
}

fun deviceName(context: Context): String =
  android.provider.Settings.Global.getString(context.contentResolver, "device_name")?.takeIf { it.isNotBlank() }
    ?: Build.MODEL
