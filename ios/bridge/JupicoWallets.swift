import Foundation
import React

/// Layer 2 — the React Native bridge for iOS.
///
/// This holds NO payment logic. It marshals the JS dictionary into the
/// RN-agnostic `ApplePayCore` (Layer 1) and translates the core's Result back
/// into Promise resolve/reject. If you find yourself adding PassKit logic here,
/// it belongs in `ios/core/ApplePayCore.swift` instead.
@objc(JupicoWallets)
final class JupicoWallets: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { return false }

    @objc(isSupported:rejecter:)
    func isSupported(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(ApplePayCore.shared.isSupported())
    }

    @objc(canMakePayments:resolver:rejecter:)
    func canMakePayments(_ request: NSDictionary,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let built = try ApplePayCore.buildRequest(from: request as? [String: Any] ?? [:])
            resolve(ApplePayCore.shared.canMakePayments(networks: built.supportedNetworks))
        } catch {
            resolve(false)
        }
    }

    @objc(requestPayment:resolver:rejecter:)
    func requestPayment(_ request: NSDictionary,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        let config = request as? [String: Any] ?? [:]
        // PassKit presentation must happen on the main thread.
        DispatchQueue.main.async {
            ApplePayCore.shared.requestPayment(config: config) { result in
                switch result {
                case .success(let payload):
                    resolve(payload)
                case .failure(let err):
                    reject(err.code, err.message, err)
                }
            }
        }
    }
}
