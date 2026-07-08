import Foundation
import PassKit

/// Layer 1 — the RN-agnostic Apple Pay core.
///
/// This file has ZERO React Native dependencies. A standalone Swift app can
/// depend on it directly (see `JupicoWalletsCore.podspec`). The RN bridge in
/// `ios/bridge` is a thin wrapper that translates dictionaries to/from this API.
public enum WalletCoreError: Error {
    case unsupportedDevice
    case noEligibleCards
    case invalidConfiguration(String)
    case cancelled
    case paymentFailed(String)

    /// Stable string code shared with the JS error model (WalletErrorCode).
    public var code: String {
        switch self {
        case .unsupportedDevice: return "UNSUPPORTED_DEVICE"
        case .noEligibleCards: return "NO_ELIGIBLE_CARDS"
        case .invalidConfiguration: return "INVALID_CONFIGURATION"
        case .cancelled: return "CANCELLED"
        case .paymentFailed: return "PAYMENT_FAILED"
        }
    }

    public var message: String {
        switch self {
        case .unsupportedDevice: return "This device cannot make Apple Pay payments."
        case .noEligibleCards: return "No eligible cards are set up in Wallet."
        case .invalidConfiguration(let m): return m
        case .cancelled: return "The user cancelled the payment."
        case .paymentFailed(let m): return m
        }
    }
}

public final class ApplePayCore: NSObject {

    public static let shared = ApplePayCore()

    // The controller and completion are retained for the lifetime of the sheet.
    private var completion: ((Result<[String: Any], WalletCoreError>) -> Void)?
    private var didAuthorize = false

    // MARK: - Capability checks

    /// Coarse check: device supports Apple Pay and the user can potentially pay.
    public func isSupported() -> Bool {
        return PKPaymentAuthorizationController.canMakePayments()
    }

    /// Fine-grained check against the specific networks the merchant accepts.
    public func canMakePayments(networks: [PKPaymentNetwork]) -> Bool {
        return PKPaymentAuthorizationController.canMakePayments(usingNetworks: networks)
    }

    // MARK: - Payment

    /// Builds and presents the payment sheet. `config` is a plain dictionary so
    /// the RN bridge can forward it verbatim; native callers can use
    /// `ApplePayConfiguration(...)` and `.asDictionary` instead.
    public func requestPayment(
        config: [String: Any],
        completion: @escaping (Result<[String: Any], WalletCoreError>) -> Void
    ) {
        guard isSupported() else {
            completion(.failure(.unsupportedDevice))
            return
        }

        let request: PKPaymentRequest
        do {
            request = try Self.buildRequest(from: config)
        } catch let e as WalletCoreError {
            completion(.failure(e))
            return
        } catch {
            completion(.failure(.invalidConfiguration(error.localizedDescription)))
            return
        }

        guard canMakePayments(networks: request.supportedNetworks) else {
            completion(.failure(.noEligibleCards))
            return
        }

        self.completion = completion
        self.didAuthorize = false

        let controller = PKPaymentAuthorizationController(paymentRequest: request)
        controller.delegate = self
        controller.present { presented in
            if !presented {
                self.finish(.failure(.paymentFailed("Unable to present the Apple Pay sheet.")))
            }
        }
    }

    private func finish(_ result: Result<[String: Any], WalletCoreError>) {
        completion?(result)
        completion = nil
    }

    // MARK: - Request building

    static func buildRequest(from config: [String: Any]) throws -> PKPaymentRequest {
        guard let apple = config["apple"] as? [String: Any],
              let merchantId = apple["merchantIdentifier"] as? String, !merchantId.isEmpty else {
            throw WalletCoreError.invalidConfiguration("apple.merchantIdentifier is required.")
        }
        guard let countryCode = apple["countryCode"] as? String else {
            throw WalletCoreError.invalidConfiguration("apple.countryCode is required.")
        }
        guard let currencyCode = config["currencyCode"] as? String else {
            throw WalletCoreError.invalidConfiguration("currencyCode is required.")
        }
        guard let networkStrings = config["supportedNetworks"] as? [String], !networkStrings.isEmpty else {
            throw WalletCoreError.invalidConfiguration("supportedNetworks must not be empty.")
        }

        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantId
        request.countryCode = countryCode
        request.currencyCode = currencyCode
        request.supportedNetworks = networkStrings.compactMap(Self.mapNetwork)
        request.merchantCapabilities = Self.mapCapabilities(apple["merchantCapabilities"] as? [String])

        // Summary line items; the total is appended last (Apple requires it).
        var summaryItems: [PKPaymentSummaryItem] = []
        if let items = config["lineItems"] as? [[String: Any]] {
            for item in items {
                guard let label = item["label"] as? String,
                      let amount = item["amount"] as? String,
                      let decimal = Self.decimal(amount) else { continue }
                let type: PKPaymentSummaryItemType =
                    (item["status"] as? String) == "pending" ? .pending : .final
                summaryItems.append(PKPaymentSummaryItem(label: label, amount: decimal, type: type))
            }
        }
        let totalLabel = (config["totalLabel"] as? String) ?? "Total"
        guard let totalAmount = config["totalAmount"] as? String, let total = Self.decimal(totalAmount) else {
            throw WalletCoreError.invalidConfiguration("totalAmount is required and must be a decimal string.")
        }
        summaryItems.append(PKPaymentSummaryItem(label: totalLabel, amount: total, type: .final))
        request.paymentSummaryItems = summaryItems

        request.requiredBillingContactFields = Self.mapContactFields(apple["requiredBillingContactFields"] as? [String])
        request.requiredShippingContactFields = Self.mapContactFields(apple["requiredShippingContactFields"] as? [String])

        return request
    }

    // MARK: - Mapping helpers

    private static func decimal(_ s: String) -> NSDecimalNumber? {
        let n = NSDecimalNumber(string: s)
        return n == NSDecimalNumber.notANumber ? nil : n
    }

    private static func mapNetwork(_ s: String) -> PKPaymentNetwork? {
        switch s.lowercased() {
        case "visa": return .visa
        case "mastercard": return .masterCard
        case "amex": return .amex
        case "discover": return .discover
        case "jcb": return .JCB
        case "maestro": if #available(iOS 12.0, *) { return .maestro } else { return nil }
        case "interac": return .interac
        default: return nil
        }
    }

    private static func mapCapabilities(_ caps: [String]?) -> PKMerchantCapability {
        guard let caps = caps, !caps.isEmpty else { return .capability3DS }
        var result: PKMerchantCapability = []
        for c in caps {
            switch c.lowercased() {
            case "3ds": result.insert(.capability3DS)
            case "emv": result.insert(.capabilityEMV)
            case "credit": result.insert(.capabilityCredit)
            case "debit": result.insert(.capabilityDebit)
            default: break
            }
        }
        return result.isEmpty ? .capability3DS : result
    }

    private static func mapContactFields(_ fields: [String]?) -> Set<PKContactField> {
        guard let fields = fields else { return [] }
        var result = Set<PKContactField>()
        for f in fields {
            switch f.lowercased() {
            case "name": result.insert(.name)
            case "email": result.insert(.emailAddress)
            case "phone": result.insert(.phoneNumber)
            case "postaladdress": result.insert(.postalAddress)
            default: break
            }
        }
        return result
    }
}

// MARK: - PKPaymentAuthorizationControllerDelegate

extension ApplePayCore: PKPaymentAuthorizationControllerDelegate {

    public func paymentAuthorizationController(
        _ controller: PKPaymentAuthorizationController,
        didAuthorizePayment payment: PKPayment,
        handler completion: @escaping (PKPaymentAuthorizationResult) -> Void
    ) {
        didAuthorize = true

        // The opaque token to forward to your backend → PSP. We do NOT decrypt
        // it here (that would be DIRECT tokenization / PCI scope).
        let tokenData = payment.token.paymentData
        let tokenBase64 = tokenData.base64EncodedString()

        var result: [String: Any] = [
            "platform": "apple-pay",
            "token": tokenBase64,
        ]
        if let method = payment.token.paymentMethod.network?.rawValue {
            result["cardNetwork"] = method
        }
        if let displayName = payment.token.paymentMethod.displayName {
            result["cardDetails"] = displayName
        }

        // We report success optimistically; a production integration may want to
        // call the PSP synchronously here and return .failure on decline.
        completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
        finish(.success(result))
    }

    public func paymentAuthorizationControllerDidFinish(
        _ controller: PKPaymentAuthorizationController
    ) {
        controller.dismiss()
        // If the sheet finished without an authorization, the user cancelled.
        if !didAuthorize {
            finish(.failure(.cancelled))
        }
    }
}
