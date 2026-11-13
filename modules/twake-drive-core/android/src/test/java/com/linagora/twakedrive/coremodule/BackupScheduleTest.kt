package com.linagora.twakedrive.coremodule

import androidx.work.NetworkType
import com.linagora.twakedrive.core.BackupConditions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupScheduleTest {
  @Test
  fun `without mobile data a pass waits for an unmetered network`() {
    val wifiOnly = constraints(BackupConditions(false, false, false)).build()
    assertEquals(NetworkType.UNMETERED, wifiOnly.requiredNetworkType)
    assertFalse(wifiOnly.requiresCharging())
    assertTrue(wifiOnly.requiresBatteryNotLow())
  }

  @Test
  fun `mobile data for one kind of media lets a pass start on any network`() {
    assertEquals(NetworkType.CONNECTED, constraints(BackupConditions(false, true, false)).build().requiredNetworkType)
  }

  @Test
  fun `only while charging waits for power`() {
    assertTrue(constraints(BackupConditions(false, false, true)).build().requiresCharging())
  }
}
