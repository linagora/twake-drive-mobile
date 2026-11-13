package com.linagora.twakedrive.coremodule

import com.linagora.twakedrive.core.md5File
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TwakeDriveCoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TwakeDriveCore")

    AsyncFunction("md5File") { path: String -> md5File(path) }
  }
}
