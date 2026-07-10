import Foundation

enum CozyError: Error, Equatable {
  case notAuthenticated
  case noSuchItem
  case filenameCollision
  case serverUnreachable
  case insufficientQuota
  case offline
  case server(Int)
}

protocol HTTPClient {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
  func download(_ request: URLRequest, to dest: URL, progress: Progress) async throws -> HTTPURLResponse
  func upload(_ request: URLRequest, fromFile file: URL, progress: Progress) async throws -> (Data, HTTPURLResponse)
}

extension HTTPClient {
  func download(_ request: URLRequest, to dest: URL, progress: Progress) async throws -> HTTPURLResponse {
    let (data, http) = try await send(request)
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: dest, options: .atomic)
    return http
  }

  func upload(_ request: URLRequest, fromFile file: URL, progress: Progress) async throws -> (Data, HTTPURLResponse) {
    var req = request
    req.httpBody = try Data(contentsOf: file)
    return try await send(req)
  }
}

struct URLSessionHTTPClient: HTTPClient {
  let session: URLSession
  init(session: URLSession = .shared) { self.session = session }

  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw CozyError.serverUnreachable }
      return (data, http)
    } catch let e as URLError where [.notConnectedToInternet, .cannotFindHost, .timedOut, .networkConnectionLost].contains(e.code) {
      throw CozyError.offline
    }
  }

  func download(_ request: URLRequest, to dest: URL, progress: Progress) async throws -> HTTPURLResponse {
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    return try await withCheckedThrowingContinuation { cont in
      let task = session.downloadTask(with: request) { tmp, response, error in
        if let e = error as? URLError, [.notConnectedToInternet, .cannotFindHost, .timedOut, .networkConnectionLost].contains(e.code) {
          cont.resume(throwing: CozyError.offline); return
        }
        if let error { cont.resume(throwing: error); return }
        guard let tmp, let http = response as? HTTPURLResponse else {
          cont.resume(throwing: CozyError.serverUnreachable); return
        }
        do {
          try? FileManager.default.removeItem(at: dest)
          try FileManager.default.moveItem(at: tmp, to: dest)
          cont.resume(returning: http)
        } catch { cont.resume(throwing: error) }
      }
      if progress.totalUnitCount > 0 {
        progress.addChild(task.progress, withPendingUnitCount: progress.totalUnitCount)
      }
      task.resume()
    }
  }

  func upload(_ request: URLRequest, fromFile file: URL, progress: Progress) async throws -> (Data, HTTPURLResponse) {
    try await withCheckedThrowingContinuation { cont in
      let task = session.uploadTask(with: request, fromFile: file) { data, response, error in
        if let e = error as? URLError, [.notConnectedToInternet, .cannotFindHost, .timedOut, .networkConnectionLost].contains(e.code) {
          cont.resume(throwing: CozyError.offline); return
        }
        if let error { cont.resume(throwing: error); return }
        guard let data, let http = response as? HTTPURLResponse else {
          cont.resume(throwing: CozyError.serverUnreachable); return
        }
        cont.resume(returning: (data, http))
      }
      if progress.totalUnitCount > 0 {
        progress.addChild(task.progress, withPendingUnitCount: progress.totalUnitCount)
      }
      task.resume()
    }
  }
}
