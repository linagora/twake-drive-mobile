import XCTest

// NOTE: no `@testable import TwakeDriveFileProviderExt` here — same reasoning as
// SessionTests.swift/KeychainSessionStoreTests.swift (Tasks 3/4): this test target has zero
// PBXTargetDependency on the TwakeDriveFileProviderExt app-extension target, so that import
// fails with "no such module" regardless of whether CozyFile.swift exists. CozyFile reaches
// this test target via scripts/ios-add-file-provider-tests.cjs's SHARED_SOURCES mechanism:
// compiled directly into this target's own Sources build phase, so it's a plain type in this
// target's own module — no import needed, same as any other file in this target.

final class CozyFileTests: XCTestCase {
  func testParsesFileAttributes() {
    let attrs: [String: Any] = [
      "type": "file", "name": "report.pdf", "dir_id": "dir-1",
      "size": "20480", "mime": "application/pdf", "class": "pdf",
      "updated_at": "2026-07-05T09:30:00.000Z", "path": "/Docs/report.pdf",
    ]
    let f = CozyFile.fromAttributes(id: "file-1", attrs)
    XCTAssertEqual(f.id, "file-1")
    XCTAssertEqual(f.name, "report.pdf")
    XCTAssertFalse(f.isDir)
    XCTAssertEqual(f.dirId, "dir-1")
    XCTAssertEqual(f.size, 20480)
    XCTAssertEqual(f.mime, "application/pdf")
    XCTAssertFalse(f.hasThumbnail)
    XCTAssertGreaterThan(f.updatedAt.timeIntervalSince1970, 0)
  }

  func testDirectoryHasZeroSizeAndNilMime() {
    let f = CozyFile.fromAttributes(id: "d", ["type": "directory", "name": "Docs", "dir_id": "root"])
    XCTAssertTrue(f.isDir)
    XCTAssertEqual(f.size, 0)
    XCTAssertNil(f.mime)
  }

  func testImageClassIsThumbnailCapable() {
    let f = CozyFile.fromAttributes(id: "i", ["type": "file", "name": "p.jpg", "class": "image", "size": "1"])
    XCTAssertTrue(f.hasThumbnail)
  }

  func testCarriesTheThumbnailLinkTheStackSigned() {
    let f = CozyFile.fromDocument([
      "id": "file-1",
      "attributes": ["type": "file", "name": "a.jpg", "class": "image"],
      "links": ["self": "/files/file-1", "tiny": "/files/file-1/thumbnails/abc/tiny",
                "medium": "/files/file-1/thumbnails/abc/medium"],
    ])
    XCTAssertEqual(f?.thumbnailLink, "/files/file-1/thumbnails/abc/medium")
  }

  func testFallsBackToAnotherSizeAndToNoLinkAtAll() {
    let small = CozyFile.fromAttributes(id: "f", ["type": "file", "name": "a.jpg"],
                                        links: ["small": "/files/f/thumbnails/abc/small"])
    XCTAssertEqual(small.thumbnailLink, "/files/f/thumbnails/abc/small")

    let none = CozyFile.fromAttributes(id: "f", ["type": "file", "name": "a.jpg"])
    XCTAssertNil(none.thumbnailLink)
  }
}
