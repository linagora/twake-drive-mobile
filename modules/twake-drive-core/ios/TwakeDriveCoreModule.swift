import ExpoModulesCore
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
      try makeStackClient().listDeviceFolders().map(\.record)
    }.runOnQueue(stackQueue)

    AsyncFunction("adoptDeviceFolder") { (folderId: String, deviceId: String) throws -> [String: Any] in
      try makeStackClient().adoptDeviceFolder(folderId: folderId, deviceId: deviceId).record
    }.runOnQueue(stackQueue)

    AsyncFunction("createDeviceFolder") {
      (deviceId: String, deviceName: String, rootName: String) throws -> [String: Any] in
      try makeStackClient()
        .createDeviceFolder(deviceId: deviceId, deviceName: deviceName, rootName: rootName).record
    }.runOnQueue(stackQueue)
  }
}

/// The stack calls wait on the network: off the queue Expo shares between the
/// async functions of every module.
private let stackQueue = DispatchQueue(label: "com.linagora.twakedrive.core.stack", qos: .userInitiated)
