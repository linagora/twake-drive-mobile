package com.linagora.twakedrive.authbridge

import android.content.pm.verify.domain.DomainVerificationUserState
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class AppLinkStateTest {
    @Test fun `a verified host is usable`() {
        assertTrue(AppLinkState.isHostUsable(DomainVerificationUserState.DOMAIN_STATE_VERIFIED, true))
    }

    @Test fun `a host the user selected is usable`() {
        assertTrue(AppLinkState.isHostUsable(DomainVerificationUserState.DOMAIN_STATE_SELECTED, true))
    }

    @Test fun `a host with no state is not usable`() {
        assertFalse(AppLinkState.isHostUsable(DomainVerificationUserState.DOMAIN_STATE_NONE, true))
        assertFalse(AppLinkState.isHostUsable(null, true))
    }

    @Test fun `a verified host is not usable when link handling is switched off`() {
        assertFalse(AppLinkState.isHostUsable(DomainVerificationUserState.DOMAIN_STATE_VERIFIED, false))
    }

    @Test @Config(sdk = [30])
    fun `below Android 12 the App Link is assumed usable`() {
        assertTrue(AppLinkState.isUsable(ApplicationProvider.getApplicationContext()))
    }
}
