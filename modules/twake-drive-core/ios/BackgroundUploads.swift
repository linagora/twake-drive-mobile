import BackgroundTasks
import ExpoModulesCore
import Foundation
import os

/// Uploads handed to the system: they go on while the app is suspended, and
/// their answers come to the delegate, in this run of the app or a later one.
/// The core keeps each upload as it was prepared (`park_upload`).
final class BackgroundUploads: NSObject, URLSessionDataDelegate {
  static let shared = BackgroundUploads()
  static let identifier = "com.linagora.twakedrive.backup"

  /// What iOS gives to call once the answers of a relaunch are read.
  var eventsDone: (() -> Void)?
  private var bodies: [Int: Data] = [:]

  /// One session for the whole run: a second one with the same identifier
  /// would not get the answers.
  lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.allowsCellularAccess = false
    // Under the core's hold of a handed media (UPLOAD_HOLD_SECS, a day): an
    // upload the system still runs is never sent again by another pass.
    configuration.timeoutIntervalForResource = 23 * 60 * 60
    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1
    return URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
  }()

  /// The system copies `file` when the task starts; it is kept until the
  /// answer, for a new try under another name.
  func hand(
    _ request: HttpRequest, media: MediaToSend, nameAttempt: UInt32, file: URL, account: String,
    store: BackupStore
  ) throws {
    let urlRequest = try URLRequest(request)
    if let earlier = try store.parkUpload(
      media: media, nameAttempt: nameAttempt, filePath: file.path, now: now())
    {
      try? FileManager.default.removeItem(atPath: earlier)
    }
    let task = session.uploadTask(with: urlRequest, fromFile: file)
    task.taskDescription = "\(account)\n\(media.localId)"
    task.resume()
  }

  /// The backup turned off: the uploads in flight end, their media stay due.
  func cancelAll() {
    session.getAllTasks { $0.forEach { $0.cancel() } }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    bodies[dataTask.taskIdentifier, default: Data()].append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let body = bodies.removeValue(forKey: task.taskIdentifier) ?? Data()
    guard let parts = task.taskDescription?.split(separator: "\n", maxSplits: 1), parts.count == 2 else {
      return
    }
    let status = (task.response as? HTTPURLResponse).map { UInt16($0.statusCode) }
    try? settle(account: String(parts[0]), localId: String(parts[1]), status: error == nil ? status : nil, body: body)
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async { [self] in
      eventsDone?()
      eventsDone = nil
      releaseOtherSubscribers()
    }
  }

  /// An answer for another account than the one signed in now is dropped:
  /// its media comes back to that account once the lease ends.
  private func settle(account: String, localId: String, status: UInt16?, body: Data) throws {
    let (client, store, current) = try openBackup()
    guard current == account, let parked = try store.parkedUpload(localId: localId) else { return }
    var done = true
    defer {
      if done {
        try? store.settleUpload(localId: localId)
        try? FileManager.default.removeItem(atPath: parked.filePath)
      }
    }
    guard let status else {
      _ = try store.recordOutcome(localId: localId, md5: parked.media.md5, outcome: .network, now: now())
      return
    }
    let reply = try client.readUploadResponse(
      media: parked.media, nameAttempt: parked.nameAttempt, status: status, body: body, now: now())
    let nameAttempt: UInt32
    switch reply {
    case .recorded: return
    case .nameTaken: nameAttempt = parked.nameAttempt + 1
    case .fileGone: nameAttempt = 0
    }
    guard let config = try store.backupConfig() else { return }
    let plan = try client.prepareUpload(
      folderId: config.folderId, deviceId: config.deviceId, media: parked.media, nameAttempt: nameAttempt,
      now: now())
    guard case .send(let request) = plan else { return }
    try hand(
      request, media: parked.media, nameAttempt: nameAttempt, file: URL(fileURLWithPath: parked.filePath),
      account: account, store: store)
    done = false
  }

  /// Expo calls iOS back once every subscriber that got the events of a
  /// session is done, and the file system module only answers for its own
  /// sessions: told this session is done too, it lets Expo call iOS back.
  private func releaseOtherSubscribers() {
    let selector = NSSelectorFromString("invokeCompletionHandlerForSessionIdentifier:")
    for case let subscriber as NSObject in ExpoAppDelegateSubscriberRepository.subscribers
    where subscriber.responds(to: selector) {
      subscriber.perform(selector, with: Self.identifier)
    }
  }
}

/// The passes the system starts: a short refresh, and a longer processing
/// task when the network is there. Each pass schedules the next ones.
enum BackupSchedule {
  static let processing = "com.linagora.twakedrive.backup.processing"
  static let refresh = "com.linagora.twakedrive.backup.refresh"

  /// Before the end of the launch, as iOS requires.
  static func register() {
    for identifier in [processing, refresh] {
      BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { run($0) }
    }
  }

  static func schedule() {
    let pass = BGProcessingTaskRequest(identifier: processing)
    pass.requiresNetworkConnectivity = true
    pass.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(pass)
    let check = BGAppRefreshTaskRequest(identifier: refresh)
    check.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
    try? BGTaskScheduler.shared.submit(check)
  }

  static func cancel() {
    BGTaskScheduler.shared.cancelAllTaskRequests()
  }

  private static func run(_ task: BGTask) {
    // Completed once, at expiry at the latest: iOS kills an app whose task
    // outlives it, while the pass may still be in an export or behind
    // another pass. The pass then stops at the next media.
    let open = OSAllocatedUnfairLock(initialState: true)
    let complete = { (success: Bool) in
      let first = open.withLock { (isOpen: inout Bool) -> Bool in
        defer { isOpen = false }
        return isOpen
      }
      if first { task.setTaskCompleted(success: success) }
    }
    task.expirationHandler = { complete(false) }
    passQueue.async {
      guard let config = try? BackupPass.savedConfig(), !passStop.withLock({ $0 }) else {
        return complete(true)
      }
      schedule()
      let pass = try? BackupPass(
        config: config, inBackground: true,
        isCancelled: { !open.withLock { $0 } || passStop.withLock { $0 } })
      complete((try? pass?.run()) != nil)
    }
  }
}

public final class BackupAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    BackupSchedule.register()
    // The answers of uploads handed in an earlier run reach a session with
    // the same identifier.
    _ = BackgroundUploads.shared.session
    return true
  }

  public func application(
    _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    // Expo calls iOS back once every subscriber is done.
    guard identifier == BackgroundUploads.identifier else { return completionHandler() }
    BackgroundUploads.shared.eventsDone = completionHandler
    _ = BackgroundUploads.shared.session
  }
}
