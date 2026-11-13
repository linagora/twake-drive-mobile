package com.linagora.twakedrive

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import com.linagora.twakedrive.coremodule.BackupHost
import com.linagora.twakedrive.coremodule.BackupSession
import com.linagora.twakedrive.fileprovider.EncryptedCredentialStore
import com.linagora.twakedrive.fileprovider.SessionStore
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import okhttp3.OkHttpClient

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(com.linagora.twakedrive.authbridge.TwakeAuthBridgePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    registerBackupSession()
  }

  private fun registerBackupSession() {
    val session = SessionStore(EncryptedCredentialStore(this), OkHttpClient())
    BackupHost.session = object : BackupSession {
      override fun baseUrl() = session.baseUri()
      override fun accessToken() = session.accessToken()
      override fun refresh(previous: String?) = session.refreshAccessToken(previous)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
