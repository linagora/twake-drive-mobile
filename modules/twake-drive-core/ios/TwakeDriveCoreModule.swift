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

    /// The user's answer to a folder gone: made again where it was.
    AsyncFunction("recreateDeviceFolder") { (folderPath: String?) throws in
      _ = try openBackup().client.recreateDeviceFolder(requestedPath: folderPath)
    }.runOnQueue(passQueue)  // with the passes and the stop, never between their steps

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

    /// The albums of the phone with the user's choice: "picked", "leftOut",
    /// or none. Shared iCloud albums are left aside, as with the flagship.
    AsyncFunction("listAlbums") { () throws -> [[String: Any]] in
      let store = try openBackup().store
      var choices = Dictionary(uniqueKeysWithValues: try store.albumChoices().map { ($0.albumId, $0.included) })
      var albums: [[String: Any]] = []
      let lists = [
        PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil),
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: nil),
      ]
      for list in lists {
        list.enumerateObjects { album, _, _ in
          let id = album.localIdentifier
          let included = choices.removeValue(forKey: id)
          // Counted as the backup reads them: photos and videos.
          let count = PHAsset.fetchAssets(in: album, options: mediaOptions()).count
          // An empty album with a choice stays, for the user to see and undo it.
          guard count > 0 || included != nil, album.assetCollectionSubtype != .smartAlbumAllHidden else { return }
          var record: [String: Any] = ["id": id, "title": album.localizedTitle ?? "", "count": count]
          if let included { record["choice"] = included ? "picked" : "leftOut" }
          albums.append(record)
        }
      }
      // The choices left are of albums deleted since: they would hold the
      // backup to albums no one can see. With limited access PhotoKit may hide
      // albums: forgetting their choice would send a left-out album to Drive
      // once the full access is back.
      if PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized {
        for id in choices.keys { try store.setAlbumChoice(albumId: id, included: nil) }
      }
      return albums
    }.runOnQueue(stackQueue)

    AsyncFunction("setAlbumChoice") { (albumId: String, choice: String?) throws in
      try openBackup().store.setAlbumChoice(
        albumId: albumId, included: choice.map { $0 == "picked" })
    }.runOnQueue(stackQueue)

    AsyncFunction("backupConditions") { () throws -> [String: Any] in
      let conditions = try openBackup().store.conditions()
      return [
        "cellularPhotos": conditions.cellularPhotos, "cellularVideos": conditions.cellularVideos,
        "onlyCharging": conditions.onlyCharging,
      ]
    }.runOnQueue(stackQueue)

    AsyncFunction("setBackupConditions") {
      (cellularPhotos: Bool, cellularVideos: Bool, onlyCharging: Bool) throws in
      let store = try openBackup().store
      let before = try store.conditions()
      let powerChanged = before.onlyCharging != onlyCharging
      if (before.cellularPhotos && !cellularPhotos) || (before.cellularVideos && !cellularVideos) {
        BackgroundUploads.shared.cancelCellular()
      }
      try store.setConditions(
        conditions: BackupConditions(
          cellularPhotos: cellularPhotos, cellularVideos: cellularVideos, onlyCharging: onlyCharging))
      // The next system pass waits for power, or no longer does.
      if powerChanged, !passStop.withLock({ $0 }), try store.backupConfig() != nil {
        BackupSchedule.schedule()
      }
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
    if let folderId, let folderPath { record["folder"] = ["id": folderId, "path": folderPath] }
    return record
  }
}

/// The stack calls wait on the network: off the queue Expo shares between the
/// async functions of every module.
private let stackQueue = DispatchQueue(label: "com.linagora.twakedrive.core.stack", qos: .userInitiated)
/// A pass may last hours: on its own queue, the folder choice stays usable.
/// The passes the system starts go there too, one at a time.
let passQueue = DispatchQueue(label: "com.linagora.twakedrive.core.pass", qos: .utility)
