package com.linagora.twakedrive.coremodule

import com.linagora.twakedrive.core.AlbumChoice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LibraryTest {
  private fun media(id: String, bucket: String?) =
    PhoneMedia("content://media/external/images/media/$id", "$id.jpg", "image/jpeg", 1, 2, bucket, bucket)

  private val camera = media("1", "camera")
  private val screenshots = media("2", "screenshots")
  private val loose = media("3", null)

  @Test
  fun `without any choice every media goes`() {
    assertEquals(listOf(camera, screenshots, loose), inAlbums(listOf(camera, screenshots, loose), emptyList()))
  }

  @Test
  fun `an album left out keeps its media back`() {
    val choices = listOf(AlbumChoice("screenshots", false))
    assertEquals(listOf(camera, loose), inAlbums(listOf(camera, screenshots, loose), choices))
  }

  @Test
  fun `with albums picked only their media go`() {
    val choices = listOf(AlbumChoice("camera", true))
    assertEquals(listOf(camera), inAlbums(listOf(camera, screenshots, loose), choices))
  }

  @Test
  fun `an album picked then gone picks nothing any more`() {
    val choices = listOf(AlbumChoice("whatsapp", true))
    assertEquals(listOf(camera, screenshots, loose), inAlbums(listOf(camera, screenshots, loose), choices))
  }

  @Test
  fun `the scan token comes back as it was saved`() {
    val token = ScanToken("v1", 4842)
    assertEquals(token, ScanToken.decode(token.encode()))
    assertNull(ScanToken.decode(null))
    assertNull(ScanToken.decode("garbage".toByteArray()))
  }

  @Test
  fun `a video is told apart by its type`() {
    assertEquals(true, media("4", null).copy(mime = "video/mp4").isVideo)
    assertEquals(false, camera.isVideo)
  }
}
