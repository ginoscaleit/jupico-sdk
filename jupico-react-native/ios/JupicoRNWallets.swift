import Foundation
import PassKit
import React

/// Presents the Apple Pay sheet for `<ApplePayJupico>`.
///
/// Two-step on purpose, mirroring Apple Pay JS: `presentApplePay` resolves as
/// soon as the user authorizes, the sheet stays open while JS gets the Jupico
/// one-time token, and `completeApplePay` then shows ✓ or ✗ and closes it.
@objc(JupicoRNWallets)
final class JupicoRNWallets: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    private var controller: PKPaymentAuthorizationController?
    private var pendingResolve: RCTPromiseResolveBlock?
    private var pendingReject: RCTPromiseRejectBlock?
    private var authorizationHandler: ((PKPaymentAuthorizationResult) -> Void)?
    private var didAuthorize = false

    @objc(canMakeApplePayments:resolver:rejecter:)
    func canMakeApplePayments(_ networks: [String],
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(PKPaymentAuthorizationController.canMakePayments(usingNetworks: networks.compactMap(Self.network)))
    }

    @objc(presentApplePay:resolver:rejecter:)
    func presentApplePay(_ request: NSDictionary,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            guard self.pendingResolve == nil, self.authorizationHandler == nil else {
                reject("PAYMENT_FAILED", "An Apple Pay payment is already in progress.", nil)
                return
            }
            let paymentRequest: PKPaymentRequest
            do {
                paymentRequest = try Self.buildRequest(request as? [String: Any] ?? [:])
            } catch {
                reject("INVALID_CONFIGURATION", error.localizedDescription, error)
                return
            }
            self.pendingResolve = resolve
            self.pendingReject = reject
            self.didAuthorize = false

            let controller = PKPaymentAuthorizationController(paymentRequest: paymentRequest)
            controller.delegate = self
            self.controller = controller
            controller.present { presented in
                if !presented {
                    self.rejectPending("PAYMENT_FAILED", "Unable to present the Apple Pay sheet. Check the merchant identifier and entitlement.")
                    self.controller = nil
                }
            }
        }
    }

    @objc(completeApplePay:resolver:rejecter:)
    func completeApplePay(_ success: Bool,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            self.authorizationHandler?(PKPaymentAuthorizationResult(status: success ? .success : .failure, errors: nil))
            self.authorizationHandler = nil
            resolve(nil)
        }
    }

    private func rejectPending(_ code: String, _ message: String) {
        pendingReject?(code, message, nil)
        pendingResolve = nil
        pendingReject = nil
    }

    // MARK: - Request

    private struct ConfigError: LocalizedError {
        let errorDescription: String?
    }

    private static func buildRequest(_ r: [String: Any]) throws -> PKPaymentRequest {
        guard let merchantId = r["merchantIdentifier"] as? String, !merchantId.isEmpty else {
            throw ConfigError(errorDescription: "merchantIdentifier is required.")
        }
        guard let total = r["total"] as? [String: Any],
              let amountString = total["amount"] as? String else {
            throw ConfigError(errorDescription: "total.amount is required.")
        }
        let amount = NSDecimalNumber(string: amountString)
        guard amount != .notANumber else {
            throw ConfigError(errorDescription: "total.amount must be a decimal string.")
        }
        let request = PKPaymentRequest()
        request.merchantIdentifier = merchantId
        request.countryCode = (r["countryCode"] as? String) ?? "US"
        request.currencyCode = (r["currencyCode"] as? String) ?? "USD"
        request.supportedNetworks = ((r["supportedNetworks"] as? [String]) ?? []).compactMap(network)
        request.merchantCapabilities = capabilities(r["merchantCapabilities"] as? [String])
        request.paymentSummaryItems = [
            PKPaymentSummaryItem(label: (total["label"] as? String) ?? "Payment Total", amount: amount, type: .final),
        ]
        // Apple Pay JS ignores email/phone on billing fields, so the web sends a
        // billingContact with name and address only. Match it.
        let fields = Set((r["requiredBillingContactFields"] as? [String]) ?? [])
        var billing = Set<PKContactField>()
        if fields.contains("name") { billing.insert(.name) }
        if fields.contains("postalAddress") { billing.insert(.postalAddress) }
        request.requiredBillingContactFields = billing
        return request
    }

    /// Apple Pay JS network names → PassKit.
    private static func network(_ s: String) -> PKPaymentNetwork? {
        switch s.lowercased() {
        case "visa": return .visa
        case "mastercard": return .masterCard
        case "amex": return .amex
        case "discover": return .discover
        case "jcb": return .JCB
        case "maestro": return .maestro
        case "interac": return .interac
        default: return nil
        }
    }

    private static func capabilities(_ caps: [String]?) -> PKMerchantCapability {
        var result: PKMerchantCapability = []
        for c in caps ?? [] {
            switch c {
            case "supports3DS": result.insert(.capability3DS)
            case "supportsEMV": result.insert(.capabilityEMV)
            case "supportsCredit": result.insert(.capabilityCredit)
            case "supportsDebit": result.insert(.capabilityDebit)
            default: break
            }
        }
        return result.isEmpty ? .capability3DS : result
    }

    // MARK: - Payment → Apple Pay JS shape

    /// `event.payment` as Apple Pay JS delivers it, so the Jupico/VGS body is
    /// identical to the web component's.
    private static func paymentDictionary(_ payment: PKPayment) -> [String: Any] {
        let token = payment.token
        let paymentData = (try? JSONSerialization.jsonObject(with: token.paymentData)) ?? [String: Any]()
        var method: [String: Any] = ["type": methodType(token.paymentMethod.type)]
        method["displayName"] = token.paymentMethod.displayName
        method["network"] = token.paymentMethod.network?.rawValue

        let contact = contactDictionary(payment.billingContact)
        return [
            "token": [
                "paymentData": paymentData,
                "paymentMethod": method,
                "transactionIdentifier": token.transactionIdentifier,
            ],
            "billingContact": contact,
        ]
    }

    private static func contactDictionary(_ contact: PKContact?) -> [String: Any] {
        guard let contact = contact else { return [:] }
        var d: [String: Any] = [:]
        d["givenName"] = contact.name?.givenName
        d["familyName"] = contact.name?.familyName
        if let a = contact.postalAddress {
            d["addressLines"] = a.street.split(separator: "\n").map(String.init)
            d["locality"] = a.city
            d["subLocality"] = a.subLocality
            d["administrativeArea"] = a.state
            d["subAdministrativeArea"] = a.subAdministrativeArea
            d["postalCode"] = a.postalCode
            d["country"] = a.country
            d["countryCode"] = a.isoCountryCode.uppercased()
        }
        d["emailAddress"] = contact.emailAddress
        d["phoneNumber"] = contact.phoneNumber?.stringValue
        return d
    }

    private static func methodType(_ t: PKPaymentMethodType) -> String {
        switch t {
        case .debit: return "debit"
        case .credit: return "credit"
        case .prepaid: return "prepaid"
        case .store: return "store"
        default: return "unknown"
        }
    }
}

extension JupicoRNWallets: PKPaymentAuthorizationControllerDelegate {

    func paymentAuthorizationController(_ controller: PKPaymentAuthorizationController,
                                        didAuthorizePayment payment: PKPayment,
                                        handler completion: @escaping (PKPaymentAuthorizationResult) -> Void) {
        didAuthorize = true
        authorizationHandler = completion
        pendingResolve?(Self.paymentDictionary(payment))
        pendingResolve = nil
        pendingReject = nil
    }

    func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
        controller.dismiss()
        // Closed without authorizing → the user cancelled.
        if !didAuthorize {
            rejectPending("CANCELLED", "The user cancelled the payment.")
        }
        // Closed while JS was still tokenizing (e.g. the sheet timed out).
        authorizationHandler = nil
        self.controller = nil
    }
}
