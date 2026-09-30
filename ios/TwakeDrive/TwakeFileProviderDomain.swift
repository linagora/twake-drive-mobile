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
    Self.isRegistered { registered in
      if registered { resolve(nil); return }
      NSFileProviderManager.add(Self.domain) { error in
        Self.settle(error, code: "add_failed", resolve, reject)
      }
    }
  }

  @objc func remove(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    Self.isRegistered { registered in
      guard registered else { resolve(nil); return }
      NSFileProviderManager.remove(Self.domain, mode: .removeAll) { _, error in
        Self.settle(error, code: "remove_failed", resolve, reject)
      }
    }
  }

  private static func isRegistered(_ completion: @escaping (Bool) -> Void) {
    NSFileProviderManager.getDomainsWithCompletionHandler { domains, _ in
      completion(domains.contains { $0.identifier == identifier })
    }
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
