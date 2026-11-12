import ExpoModulesCore
import os
import Photos
import UIKit

public class TwakeDriveCoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TwakeDriveCore")

    AsyncFunction("md5File") { (path: String) throws -> String in
      try md5File(path: path)
    }

    AsyncFunction("requestPhotoAccess") { () async -> String in
      switch await PHPhotoLibrary.requestAuthorization(for: .readWrite) {
      case .authorized: return "authorized"
      case .limited: return "limited"
      case .restricted: return "restricted"
      default: return "denied"
      }
    }

    /// A model name ("iPhone") unless Apple grants the app the name the user
    /// gave the phone: the user may change it before the folder is created.
    AsyncFunction("deviceName") { () -> String in
      await MainActor.run { UIDevice.current.name }
    }

    AsyncFunction("listDeviceFolders") { () throws -> [[String: Any]] in
      try openBackup().client.listDeviceFolders().map(\.record)
    }.runOnQueue(stackQueue)

    AsyncFunction("adoptDeviceFolder") { (folderId: String, deviceId: String) throws -> [String: Any] in
      try openBackup().client.adoptDeviceFolder(folderId: folderId, deviceId: deviceId).record
    }.runOnQueue(stackQueue)

    AsyncFunction("createDeviceFolder") {
      (deviceId: String, deviceName: String, rootName: String) throws -> [String: Any] in
      try openBackup().client
        .createDeviceFolder(deviceId: deviceId, deviceName: deviceName, rootName: rootName).record
    }.runOnQueue(stackQueue)

    Events("onBackupProgress")

    AsyncFunction("runBackupPass") { (folderId: String, deviceId: String) throws -> [String: Any] in
      passStop.withLock { $0 = false }
      // A pass that fails, offline for one, still leaves the next ones planned.
      defer { if !passStop.withLock({ $0 }) { BackupSchedule.schedule() } }
      return try runInBackgroundTime { expired in
        try BackupPass(
          config: BackupConfig(folderId: folderId, deviceId: deviceId), inBackground: false,
          isCancelled: { expired() || passStop.withLock { $0 } },
          onProgress: { [weak self] in self?.sendEvent("onBackupProgress", $0.record) }
        ).run()
      }.record
    }.runOnQueue(passQueue)

    AsyncFunction("backupStatus") { () throws -> [String: Any] in
      try openBackup().store.status().record
    }.runOnQueue(stackQueue)

    /// Without asking: the screen tells when the access was taken back.
    Function("photoAccess") { () -> String in
      switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
      case .authorized: return "authorized"
      case .limited: return "limited"
      case .restricted: return "restricted"
      case .notDetermined: return "notDetermined"
      default: return "denied"
      }
    }

    AsyncFunction("retryFailed") { () throws in
      try openBackup().store.retryFailed()
    }.runOnQueue(stackQueue)

    /// The pass running ends after the media in progress, the uploads handed
    /// to the system are cancelled, and the system starts no pass any more.
    Function("stopBackupPass") {
      passStop.withLock { $0 = true }
      BackupSchedule.cancel()
      BackgroundUploads.shared.cancelAll()
      // After the pass running, before a pass of the backup turned on again.
      passQueue.async { try? openBackup().store.clearBackupConfig() }
    }
  }
}

/// Set when the backup is turned off: the passes running stop, and the
/// system starts none until it is turned on again.
let passStop = OSAllocatedUnfairLock(initialState: false)

/// Leaving the app mid-upload would waste that upload: iOS grants some time
/// to finish the media in progress, then the pass stops.
private func runInBackgroundTime<T>(_ body: (_ isCancelled: @escaping () -> Bool) throws -> T) throws -> T {
  let app = DispatchQueue.main.sync { UIApplication.shared }
  let lock = NSLock()
  nonisolated(unsafe) var task = UIBackgroundTaskIdentifier.invalid
  // Ends the task once: iOS kills an app whose expired task stays open.
  let end = {
    let ending = lock.withLock { () -> UIBackgroundTaskIdentifier in
      defer { task = .invalid }
      return task
    }
    if ending != .invalid { app.endBackgroundTask(ending) }
  }
  let started = app.beginBackgroundTask(withName: "photo-backup", expirationHandler: end)
  lock.withLock { task = started }
  defer { end() }
  return try body { lock.withLock { task == .invalid } }
}

extension BackupCounts {
  var record: [String: Any] {
    ["done": done, "pending": pending, "skipped": skipped, "failed": failed, "unavailable": unavailable]
  }
}

extension BackupStatus {
  var record: [String: Any] {
    var record = counts.record
    if let lastPassAt { record["lastPassAt"] = lastPassAt }
    if let stoppedBy { record["stoppedBy"] = stoppedBy }
    return record
  }
}

/// The stack calls wait on the network: off the queue Expo shares between the
/// async functions of every module.
private let stackQueue = DispatchQueue(label: "com.linagora.twakedrive.core.stack", qos: .userInitiated)
/// A pass may last hours: on its own queue, the folder choice stays usable.
/// The passes the system starts go there too, one at a time.
let passQueue = DispatchQueue(label: "com.linagora.twakedrive.core.pass", qos: .utility)
