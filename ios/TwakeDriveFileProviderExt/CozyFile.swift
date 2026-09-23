import Foundation

struct CozyFile: Equatable {
  let id: String
  let name: String
  let isDir: Bool
  let dirId: String?
  let size: Int64
  let mime: String?
  let klass: String?
  let updatedAt: Date
  let path: String?
  /// Path of the thumbnail the stack signed for this file. It carries a secret,
  /// so it cannot be rebuilt from the id.
  var thumbnailLink: String? = nil

  var hasThumbnail: Bool { klass == "image" }

  private static let iso: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return f
  }()

  private static func parseDate(_ s: String?) -> Date {
    guard let s, s.count >= 19 else { return Date(timeIntervalSince1970: 0) }
    return iso.date(from: String(s.prefix(19))) ?? Date(timeIntervalSince1970: 0)
  }

  /// The `links` of a JSON-API document, preferring the size a picker shows.
  private static func thumbnailLink(_ links: [String: Any]?) -> String? {
    guard let links else { return nil }
    for size in ["medium", "small", "large", "tiny"] {
      if let link = links[size] as? String, !link.isEmpty { return link }
    }
    return nil
  }

  /// Ports Models.kt CozyFile.fromDocument.
  static func fromDocument(_ node: [String: Any]) -> CozyFile? {
    guard let id = node["id"] as? String,
          let attrs = node["attributes"] as? [String: Any] else { return nil }
    return fromAttributes(id: id, attrs, links: node["links"] as? [String: Any])
  }

  /// Ports Models.kt CozyFile.fromAttributes.
  static func fromAttributes(id: String, _ a: [String: Any], links: [String: Any]? = nil) -> CozyFile {
    let isDir = (a["type"] as? String) == "directory"
    func str(_ k: String) -> String? {
      guard let v = a[k] as? String, !v.isEmpty else { return nil }
      return v
    }
    let size: Int64 = isDir ? 0 : Int64(str("size") ?? "0") ?? 0
    return CozyFile(
      id: id,
      name: str("name") ?? "",
      isDir: isDir,
      dirId: str("dir_id"),
      size: size,
      mime: str("mime"),
      klass: str("class"),
      updatedAt: parseDate(str("updated_at")),
      path: str("path"),
      thumbnailLink: thumbnailLink(links)
    )
  }
}
