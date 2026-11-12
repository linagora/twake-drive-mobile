import Foundation

/// The same keychain item and the same refresh lock as the File Provider
/// extension (FileProviderExtension.swift).
private let sharedKeychainGroup = "KUT463DS29.com.linagora.twakedrive.shared"
private let appGroup = "group.com.linagora.twakedrive"

/// The session of the app: in the keychain group it shares with its
/// extensions, or in its own keychain on a Simulator build, which has none.
struct AppSessionStore: SessionStoring {
  private let shared = KeychainSessionStore(access: RealKeychainAccess(), accessGroup: sharedKeychainGroup)
  private let own = KeychainSessionStore(access: RealKeychainAccess(), accessGroup: "")

  func load() throws -> Session? {
    try shared.load() ?? own.load()
  }

  func save(_ session: Session) throws {
    try (shared.load() != nil ? shared : own).save(session)
  }
}

/// No URL or path in the reason: the description of a URLError or of a file
/// error names them, and the core would pass it on as is.
func coreError(_ error: Error) -> CoreError {
  switch error {
  case let error as CoreError: return error
  case CozyError.offline: return .Network(reason: "offline")
  case let error as URLError: return .Network(reason: error.code.rawValue.description)
  case let error as CozyError: return .Stack(reason: "\(error)")
  default:
    let error = error as NSError
    return .Stack(reason: "\(error.domain) \(error.code)")
  }
}

/// Runs async code for a caller that must wait: the core calls the platform
/// synchronously, never from the main thread.
func waitFor<T>(_ body: @escaping @Sendable () async throws -> T) throws -> T {
  dispatchPrecondition(condition: .notOnQueue(.main))
  let done = DispatchSemaphore(value: 0)
  nonisolated(unsafe) var result: Result<T, Error>!
  Task.detached {
    do { result = .success(try await body()) } catch { result = .failure(error) }
    done.signal()
  }
  done.wait()
  return try result.mapError(coreError).get()
}

final class AppTokenSource: TokenSource {
  private let provider: TokenProvider

  init(store: SessionStoring) {
    let lock = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent("token-refresh.lock")
    provider = TokenProvider(store: store, client: URLSessionHTTPClient(), lockURL: lock)
  }

  func accessToken() throws -> String {
    try waitFor { [provider] in try await provider.validAccessToken() }
  }

  func refresh(rejected: String) throws -> String {
    try waitFor { [provider] in try await provider.forceRefresh(previous: rejected) }
  }
}

final class URLSessionTransport: StackTransport {
  func send(request: HttpRequest) throws -> HttpResponse {
    try exchange(request)
  }
}

func exchange(_ request: HttpRequest, file: URL? = nil) throws -> HttpResponse {
  guard let url = URL(string: request.url) else {
    throw CoreError.Stack(reason: "invalid request URL")
  }
  var urlRequest = URLRequest(url: url)
  urlRequest.httpMethod = request.method
  urlRequest.httpBody = request.body
  for header in request.headers {
    urlRequest.setValue(header.value, forHTTPHeaderField: header.name)
  }
  let (data, response) = try waitFor {
    if let file { return try await URLSession.shared.upload(for: urlRequest, fromFile: file) }
    return try await URLSession.shared.data(for: urlRequest)
  }
  guard let http = response as? HTTPURLResponse else {
    throw CoreError.Stack(reason: "not an HTTP answer")
  }
  return HttpResponse(status: UInt16(http.statusCode), body: data)
}

/// The state of the backup of one account, out of the device backups: one
/// Drive folder per phone, so a copy restored elsewhere would claim its media
/// are saved. It stays readable while the phone is locked, for the background
/// task.
private func openBackupStore(account: String) throws -> BackupStore {
  let folder = try FileManager.default
    .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    .appendingPathComponent("backup", isDirectory: true)
  try FileManager.default.createDirectory(
    at: folder, withIntermediateDirectories: true,
    attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
  var excluded = folder
  var values = URLResourceValues()
  values.isExcludedFromBackup = true
  try excluded.setResourceValues(values)
  let path = folder.appendingPathComponent("\(account).db").path
  do {
    return try BackupStore.open(path: path)
  } catch CoreError.Unusable {
    for suffix in ["", "-wal", "-shm"] {
      try? FileManager.default.removeItem(atPath: path + suffix)
    }
    return try BackupStore.open(path: path)
  }
}

/// The client of the signed-in account and its backup state, built on each
/// use: the account may have changed since the last one.
func openBackup() throws -> (client: StackClient, store: BackupStore) {
  let sessions = AppSessionStore()
  guard let session = try sessions.load(), let host = URL(string: session.baseURL)?.host else {
    throw CoreError.Stack(reason: "not signed in")
  }
  let account = host.lowercased().map { $0.isLetter || $0.isNumber || $0 == "." ? $0 : "_" }
  let store = try Result { try openBackupStore(account: String(account)) }.mapError(coreError).get()
  let client = StackClient(
    instanceUrl: session.baseURL, transport: URLSessionTransport(),
    tokens: AppTokenSource(store: sessions), store: store)
  return (client, store)
}

extension DeviceFolder {
  var record: [String: Any] {
    ["id": id, "name": name, "path": path, "deviceIds": deviceIds, "createdAt": createdAt]
  }
}
