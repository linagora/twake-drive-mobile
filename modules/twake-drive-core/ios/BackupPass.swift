import Foundation
import Network
import Photos
import UIKit
import UniformTypeIdentifiers

/// One pass of the photo backup: the core decides what to send and reads the
/// answers, this sends the files. In the foreground it waits for each answer;
/// started by the system, it hands the uploads to a background session and
/// the answers come later (`BackgroundUploads`).
final class BackupPass {
  private let client: StackClient
  private let store: BackupStore
  private let account: String
  private var config: BackupConfig
  private let inBackground: Bool
  private let isCancelled: () -> Bool
  private let onProgress: ((BackupStatus) -> Void)?
  private let conditions: BackupConditions
  /// Media of this pass held back for mobile data.
  private var heldBack: [String] = []

  init(
    config: BackupConfig, inBackground: Bool, isCancelled: @escaping () -> Bool,
    onProgress: ((BackupStatus) -> Void)? = nil
  ) throws {
    (client, store, account) = try openBackup()
    self.config = config
    self.inBackground = inBackground
    self.isCancelled = isCancelled
    self.onProgress = onProgress
    conditions = try store.conditions()
  }

  /// The config the system passes start from, nil once the backup is off.
  static func savedConfig() throws -> BackupConfig? {
    try openBackup().store.backupConfig()
  }

  func run() throws -> BackupStatus {
    // Without access every media looks gone from the library and would be forgotten.
    guard [.authorized, .limited].contains(PHPhotoLibrary.authorizationStatus(for: .readWrite)) else {
      throw CoreError.Io(reason: "no access to the photo library")
    }
    // A stored folder wins: a pass of the system may have moved to another folder of the device.
    if !inBackground, try store.backupConfig() == nil { try store.setBackupConfig(config: config) }
    // First: a short call, which also refreshes a token a 401 left expired. Before
    // the conditions, so a folder gone asks the user even while the backup waits.
    guard let folder = try client.ensureDeviceFolder(requested: config) else {
      report()
      return try store.status()
    }
    config = folder
    // The long background task waits for power itself (BackupSchedule); the
    // app and the short refresh check here, before any work.
    if conditions.onlyCharging && !isCharging() {
      try store.waitFor(cause: "WaitingForPower")
      report()
      return try store.status()
    }
    try cleanExportFolder()
    try client.syncFolderIndex(folderId: config.folderId)
    try scanLibrary()
    // Reached the stack: what stopped the last pass may be over.
    try store.beginPass()
    report()
    let cancelled = try sendDue()
    if !heldBack.isEmpty {
      // Due again for the next pass, on Wi-Fi, instead of after their lease.
      try store.releaseMedia(localIds: heldBack)
      try store.waitFor(cause: "WaitingForWifi")
    }
    // The backup goes on without the albums of Drive Photos when this fails.
    // shortcut: every album is read each pass; skip it when no media was saved
    // since the last one if large libraries slow passes.
    if !cancelled {
      try? client.syncAlbums(deviceId: config.deviceId, albums: albumsForDrive(store.albumChoices()), now: now())
    }
    // A pass cut short is not the last backup.
    if !cancelled { try store.endPass(now: now()) }
    report()
    return try store.status()
  }

  /// After an upload of the system ended: the media due next take its place,
  /// unless what stopped the backup is still there (a full Drive, a refused
  /// session, Wi-Fi awaited) until the next pass, or its folder is gone.
  func handMore() throws {
    guard try store.status().stoppedBy == nil else { return }
    guard let folder = try client.ensureDeviceFolder(requested: config) else { return }
    config = folder
    if conditions.onlyCharging && !isCharging() { return }
    _ = try sendDue()
    if !heldBack.isEmpty { try store.releaseMedia(localIds: heldBack) }
  }

  /// The media due, a batch at a time; whether the pass was cancelled. Handed
  /// to the system, no more than `BackgroundUploads.maxInFlight` go at once:
  /// the uploads share one connection, and dozens of them each crawled until
  /// the proxy cut them, then all went again. A batch is no bigger than what
  /// may go, so nothing stays held for nothing when the pass stops.
  private func sendDue() throws -> Bool {
    while true {
      if isCancelled() { return true }
      let free = inBackground ? BackgroundUploads.shared.freeSlots() : 16
      if free == 0 { return false }
      let batch = try store.nextBatch(now: now(), limit: UInt32(free), leaseSecs: 600)
      if batch.isEmpty { return false }
      for queued in batch {
        if isCancelled() { return true }
        let action = try send(queued)
        report()
        if action == .stop { return false }
      }
    }
  }

  /// For the screen only: a state it cannot read does not stop the pass.
  private func report() {
    guard let onProgress, let status = try? store.status() else { return }
    onProgress(status)
  }

  /// A pass killed mid-upload leaves its copy behind, a video may weigh
  /// gigabytes. The files of the uploads in flight stay until their answer,
  /// or until a day without one.
  private func cleanExportFolder() throws {
    try FileManager.default.createDirectory(at: exportFolder, withIntermediateDirectories: true)
    _ = try store.dropLostUploads(now: now())
    let kept = Set(try store.parkedFiles())
    for file in try FileManager.default.contentsOfDirectory(at: exportFolder, includingPropertiesForKeys: nil)
    where !kept.contains(file.path) {
      try? FileManager.default.removeItem(at: file)
    }
  }

  /// Only what changed since the last pass, or the whole library the first
  /// time and when iOS no longer has the changes since the saved token.
  private func scanLibrary() throws {
    let library = PHPhotoLibrary.shared()
    // Taken before reading: a change made during the scan comes again next time.
    let current = library.currentChangeToken
    // A change token says nothing of album membership: with albums chosen,
    // their media are read whole each time.
    // shortcut: a full read per pass, without the adjustment data (a favorite
    // on an edited photo hashes it again); watch album changes if a large
    // library makes passes slow.
    let choices = try store.albumChoices()
    if !choices.isEmpty {
      let ids = mediaOfAlbums(choices)
      try record(PHAsset.fetchAssets(withLocalIdentifiers: Array(ids), options: mediaOptions()), readEdits: false)
      try store.keepOnly(libraryIds: Array(ids))
      return
    }
    // With limited access, media the user adds to the selection may not show
    // up as changes: the selection is small, it is read whole each time.
    let full = PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized
    if !full || (try? scanChanges(library)) != true {
      // shortcut: media deleted while no change token held stay counted;
      // only this fallback misses them.
      try record(PHAsset.fetchAssets(with: mediaOptions()), readEdits: false)
    }
    if full {
      try store.setChangeToken(
        token: try NSKeyedArchiver.archivedData(withRootObject: current, requiringSecureCoding: true))
    }
  }

  /// False without a saved token. Throws when iOS no longer has the changes since it.
  private func scanChanges(_ library: PHPhotoLibrary) throws -> Bool {
    guard let saved = try store.changeToken(),
      let token = try NSKeyedUnarchiver.unarchivedObject(ofClass: PHPersistentChangeToken.self, from: saved)
    else { return false }
    var changed = Set<String>()
    var deleted = Set<String>()
    for change in try library.fetchPersistentChanges(since: token) {
      let details = try change.changeDetails(for: .asset)
      changed.formUnion(details.insertedLocalIdentifiers)
      changed.formUnion(details.updatedLocalIdentifiers)
      deleted.formUnion(details.deletedLocalIdentifiers)
    }
    for id in deleted {
      try store.forgetMedia(localId: id)
      try store.forgetMedia(localId: pairedVideoKey(libraryId: id))
    }
    try record(PHAsset.fetchAssets(withLocalIdentifiers: Array(changed), options: mediaOptions()), readEdits: true)
    return true
  }

  /// `readEdits`: read the adjustment data of edited media, one at a time and
  /// perhaps from iCloud. A full scan does not: their known version stays.
  private func record(_ assets: PHFetchResult<PHAsset>, readEdits: Bool) throws {
    var media: [LibraryMedia] = []
    assets.enumerateObjects { asset, _, _ in
      let id = asset.localIdentifier
      let version = !asset.hasAdjustments ? "original" : readEdits ? adjustmentVersion(asset) : nil
      let video = asset.mediaSubtypes.contains(.photoLive) ? pairedVideoKey(libraryId: id) : nil
      let row = { (localId: String, pairedVideo: String?) in
        LibraryMedia(
          localId: localId, createdAt: seconds(asset.creationDate),
          modifiedAt: seconds(asset.modificationDate ?? asset.creationDate),
          contentVersion: version, pairedVideo: pairedVideo)
      }
      if let video { media.append(row(video, nil)) }
      media.append(row(id, video))
    }
    try store.recordLibrary(media: media)
  }

  private func send(_ queued: QueuedMedia) throws -> PassAction {
    let id = libraryId(localId: queued.localId)
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
      try store.forgetMedia(localId: queued.localId)
      return .continue
    }
    // Read for each media: the user may take mobile data back during a pass.
    let cellular = try store.conditions().allowsCellular(video: isVideo(queued.localId, asset: asset))
    // Before the iCloud download too, which has no such setting: the media
    // stays due and comes back on Wi-Fi.
    if !cellular && NetworkPath.isCellular {
      heldBack.append(queued.localId)
      return .continue
    }
    // An md5 from a pass cut short: its content may be in Drive already, no
    // need to fetch it from iCloud again.
    if let known = queued.md5,
      try client.alreadyThere(localId: queued.localId, md5: known, now: now()) != nil
    {
      return .continue
    }
    guard let export = try? Export(asset, pairedVideo: id != queued.localId) else {
      try store.recordUnavailable(localId: queued.localId, modifiedAt: queued.modifiedAt, now: now())
      return .continue
    }
    var handedOver = false
    defer { if !handedOver { export.remove() } }
    // Hashed on each export: a render may differ from the last one, and a
    // stale md5 would cost a whole upload refused by the stack.
    let md5 = try md5File(path: export.file.path)
    if md5 != queued.md5 {
      try store.setMd5(localId: queued.localId, modifiedAt: queued.modifiedAt, md5: md5)
    }
    let media = MediaToSend(
      localId: queued.localId, name: export.name, mime: export.mime, size: export.size, md5: md5,
      createdAt: seconds(asset.creationDate), modifiedAt: queued.modifiedAt,
      pairedVideoId: queued.pairedVideoId)
    var nameAttempt: UInt32 = 0
    while true {
      let plan = try client.prepareUpload(
        folderId: config.folderId, deviceId: config.deviceId, media: media, nameAttempt: nameAttempt,
        now: now())
      guard case .send(let request) = plan else { return .continue }
      if inBackground {
        try BackgroundUploads.shared.hand(
          request, media: media, nameAttempt: nameAttempt, file: export.file, account: account, store: store,
          allowsCellular: cellular)
        handedOver = true
        return .continue
      }
      let response: HttpResponse
      do {
        response = try exchange(request, file: export.file, allowsCellular: cellular)
      } catch CoreError.Network {
        return try store.recordOutcome(localId: media.localId, md5: md5, outcome: .network, now: now())
      }
      switch try client.readUploadResponse(
        media: media, nameAttempt: nameAttempt, status: response.status, body: response.body, now: now())
      {
      case .nameTaken: nameAttempt += 1
      case .fileGone: nameAttempt = 0
      case .recorded(let action): return action
      }
    }
  }
}

/// The current version of a media, copied out of the library (from iCloud if
/// need be) into a file of its own.
private struct Export {
  let file: URL
  let name: String
  let mime: String
  let size: UInt64

  init(_ asset: PHAsset, pairedVideo: Bool) throws {
    let resources = PHAssetResource.assetResources(for: asset)
    let edited = resources.contains { $0.type == .adjustmentData }
    let types: [PHAssetResourceType] =
      pairedVideo
      ? (edited ? [.fullSizePairedVideo, .pairedVideo] : [.pairedVideo])
      : asset.mediaType == .video
        ? (edited ? [.fullSizeVideo, .video] : [.video])
        : (edited ? [.fullSizePhoto, .photo] : [.photo])
    let original = resources.first { $0.type == .photo || $0.type == .video }
    guard
      let resource = types.lazy.compactMap({ type in resources.first { $0.type == type } }).first,
      let original
    else { throw CoreError.Io(reason: "no resource to export") }
    let type = UTType(resource.uniformTypeIdentifier)
    // An edited photo exports as FullSizeRender.jpg, the video of a Live Photo
    // under some other name: both take the photo's name. The flagship always
    // names that video .MOV.
    let base = (original.originalFilename as NSString).deletingPathExtension
    let ext =
      pairedVideo
      ? "MOV" : type?.preferredFilenameExtension ?? (original.originalFilename as NSString).pathExtension
    name = resource === original ? original.originalFilename : "\(base).\(ext)"
    mime = type?.preferredMIMEType ?? "application/octet-stream"
    file = exportFolder.appendingPathComponent("\(UUID().uuidString).\(ext)")
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true
    do {
      try waitFor { [file] in
        try await PHAssetResourceManager.default().writeData(for: resource, toFile: file, options: options)
      }
      size = (try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.uint64Value ?? 0
    } catch {
      try? FileManager.default.removeItem(at: file)
      throw error
    }
  }

  func remove() {
    try? FileManager.default.removeItem(at: file)
  }
}

/// iOS gives no date of the last edit, and modificationDate moves with a
/// favorite too. The adjustment data of an edited media changes with each
/// edit only: its md5 tells the content apart. A few kilobytes. Nil when it
/// cannot be read: the core then goes by the date.
private func adjustmentVersion(_ asset: PHAsset) -> String? {
  guard
    let resource = PHAssetResource.assetResources(for: asset).first(where: { $0.type == .adjustmentData })
  else { return nil }
  let options = PHAssetResourceRequestOptions()
  options.isNetworkAccessAllowed = true
  let file = exportFolder.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: file) }
  guard
    (try? waitFor {
      try await PHAssetResourceManager.default().writeData(for: resource, toFile: file, options: options)
    }) != nil
  else { return nil }
  return (try? md5File(path: file.path)).map { "adjusted:\($0)" }
}

/// The media of the albums picked, or of the whole library when none is,
/// less those of the albums left out (as Immich does).
private func mediaOfAlbums(_ choices: [AlbumChoice]) -> Set<String> {
  func ids(of albums: [String]) -> Set<String> {
    var ids = Set<String>()
    PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: albums, options: nil)
      .enumerateObjects { album, _, _ in
        PHAsset.fetchAssets(in: album, options: mediaOptions()).enumerateObjects { asset, _, _ in
          ids.insert(asset.localIdentifier)
        }
      }
    return ids
  }
  // An album picked then deleted picks nothing any more.
  let existing = PHAssetCollection.fetchAssetCollections(
    withLocalIdentifiers: choices.filter(\.included).map(\.albumId), options: nil)
  var picked: [String] = []
  existing.enumerateObjects { album, _, _ in picked.append(album.localIdentifier) }
  var media = Set<String>()
  if picked.isEmpty {
    PHAsset.fetchAssets(with: mediaOptions()).enumerateObjects { asset, _, _ in
      media.insert(asset.localIdentifier)
    }
  } else {
    media = ids(of: picked)
  }
  return media.subtracting(ids(of: choices.filter { !$0.included }.map(\.albumId)))
}

/// The albums Drive Photos gets, with their media: those picked, or every
/// album the user made when none is (not the smart ones: Recents would hold
/// the whole library), less those left out.
private func albumsForDrive(_ choices: [AlbumChoice]) -> [AlbumMedia] {
  let leftOut = Set(choices.filter { !$0.included }.map(\.albumId))
  let picked = PHAssetCollection.fetchAssetCollections(
    withLocalIdentifiers: choices.filter(\.included).map(\.albumId), options: nil)
  let albumsOfPhone =
    picked.count > 0
    ? picked : PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: nil)
  var albums: [AlbumMedia] = []
  albumsOfPhone
    .enumerateObjects { album, _, _ in
      guard !leftOut.contains(album.localIdentifier) else { return }
      var ids: [String] = []
      PHAsset.fetchAssets(in: album, options: mediaOptions()).enumerateObjects { asset, _, _ in
        ids.append(asset.localIdentifier)
      }
      albums.append(
        AlbumMedia(albumId: album.localIdentifier, name: album.localizedTitle ?? "", localIds: ids))
    }
  return albums
}

func mediaOptions() -> PHFetchOptions {
  let options = PHFetchOptions()
  options.predicate = NSPredicate(
    format: "mediaType == %d OR mediaType == %d",
    PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
  return options
}

/// Cleaned at the start of each pass. Passes run one at a time.
let exportFolder = FileManager.default.temporaryDirectory
  .appendingPathComponent("backup-export", isDirectory: true)

/// Mobile data, as `allowsCellularAccess` sees it: a Wi-Fi shared by a phone
/// counts as Wi-Fi.
enum NetworkPath {
  private static let monitor: NWPathMonitor = {
    let monitor = NWPathMonitor()
    monitor.start(queue: DispatchQueue(label: "com.linagora.twakedrive.core.path"))
    return monitor
  }()

  /// Started at launch: the first path comes a moment after the start.
  static func start() { _ = monitor }

  static var isCellular: Bool {
    let path = monitor.currentPath
    return path.usesInterfaceType(.cellular) && !path.usesInterfaceType(.wifi)
  }
}

extension BackupConditions {
  func allowsCellular(video: Bool) -> Bool { video ? cellularVideos : cellularPhotos }
}

/// The video of a Live Photo counts as a video.
func isVideo(_ localId: String, asset: PHAsset?) -> Bool {
  libraryId(localId: localId) != localId || asset?.mediaType == .video
}

private func isCharging() -> Bool {
  DispatchQueue.main.sync {
    UIDevice.current.isBatteryMonitoringEnabled = true
    return [.charging, .full].contains(UIDevice.current.batteryState)
  }
}

func now() -> Int64 {
  Int64(Date().timeIntervalSince1970)
}

private func seconds(_ date: Date?) -> Int64 {
  Int64(date?.timeIntervalSince1970 ?? 0)
}
