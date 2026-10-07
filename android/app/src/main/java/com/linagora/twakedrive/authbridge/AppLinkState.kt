package com.linagora.twakedrive.authbridge

import android.content.Context
import android.content.pm.verify.domain.DomainVerificationManager
import android.content.pm.verify.domain.DomainVerificationUserState
import android.os.Build

/**
 * Whether Android will open https://links.twake.app in this app, which is what the OAuth
 * redirect (an App Link) needs to bring the user back. An App Link the OS did not verify opens
 * the web page instead, which is a 404.
 *
 * Android 12 (API 31) exposes the per-host state, so it is read there. On Android 6 to 11 the
 * verification is all-or-nothing at install time and only `pm get-app-links` (a shell command)
 * reports it, so the answer is `true` there: the App Link stays the behaviour it has always
 * been on those versions.
 */
object AppLinkState {
    const val HOST = "links.twake.app"

    fun isUsable(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(DomainVerificationManager::class.java) ?: return true
        val state = manager.getDomainVerificationUserState(context.packageName) ?: return true
        return isHostUsable(state.hostToStateMap[HOST], state.isLinkHandlingAllowed)
    }

    /** `hostState` is a `DomainVerificationUserState.DOMAIN_STATE_*` value, null when unknown. */
    internal fun isHostUsable(hostState: Int?, linkHandlingAllowed: Boolean): Boolean =
        linkHandlingAllowed &&
            (hostState == DomainVerificationUserState.DOMAIN_STATE_VERIFIED ||
                hostState == DomainVerificationUserState.DOMAIN_STATE_SELECTED)
}
