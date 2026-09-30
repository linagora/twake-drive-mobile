import FileProvider
import Foundation
import React

@objc(TwakeFileProviderDomain)
final class TwakeFileProviderDomain: NSObject {
  private static let identifier = NSFileProviderDomainIdentifier(rawValue: "twake-drive")

  private static var domain: NSFileProviderDomain {
    NSFileProviderDomain(identifier: identifier, displayName: "Twake Drive")
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func ensure(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    NSFileProviderManager.add(Self.domain) { error in
      Self.settle(error, code: "add_failed", resolve, reject)
    }
  }

  @objc func remove(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    NSFileProviderManager.remove(Self.domain, mode: .removeAll) { _, error in
      Self.settle(Self.isMissingDomain(error) ? nil : error, code: "remove_failed", resolve, reject)
    }
  }

  private static func isMissingDomain(_ error: Error?) -> Bool {
    guard let error = error as NSError?, error.domain == NSFileProviderErrorDomain else { return false }
    if error.code == NSFileProviderError.Code.noSuchItem.rawValue { return true }
    if #available(iOS 17.1, *) {
      return error.code == NSFileProviderError.Code.providerDomainNotFound.rawValue
    }
    return false
  }

  private static func settle(_ error: Error?, code: String,
                             _ resolve: RCTPromiseResolveBlock,
                             _ reject: RCTPromiseRejectBlock) {
    if let error {
      reject(code, error.localizedDescription, error)
    } else {
      resolve(nil)
    }
  }
}
