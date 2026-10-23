import UIKit
import PassKit
import SwiftUI

/// Layer 1 UI — the native equivalent of the `<apple-pay-jupico>` web component.
///
/// This view is the source of truth for the Apple Pay UI on iOS. It has ZERO
/// React Native dependencies: Swift/SwiftUI apps use it directly, and the RN
/// `<ApplePayJupico>` tag is a thin wrapper around it.
///
/// Contract (same as the web component):
/// - `sessions`: the authorize-session object (`{ data: base64 }` or decoded).
/// - `transactionComplete`: success handler, receives `{ oneTimeToken: { paymentToken: { data } } }`.
/// - `submitError`: failure handler, receives `{ error: { code, message } }`.
/// - `statusChange`: fired for every scenario; the same status is rendered
///   inside the component under the button.
open class ApplePayJupicoView: UIView {

    // MARK: - Inputs

    @objc public var sessions: [String: Any]? { didSet { scheduleReload() } }
    /// Must match the app's `com.apple.developer.in-app-payments` entitlement.
    /// The web flow gets this server-side; native PassKit needs it locally.
    @objc public var merchantIdentifier: String?
    @objc public var disabled: Bool = false { didSet { scheduleReload() } }
    public var buttonStyle: PKPaymentButtonStyle = .black { didSet { rebuildButton() } }

    // MARK: - Outputs

    public var transactionComplete: (([String: Any]) -> Void)?
    public var submitError: (([String: Any]) -> Void)?
    public var statusChange: (([String: Any]) -> Void)?

    public private(set) var status: JupicoWalletStatus = .unavailable
    public private(set) var statusMessage: String?

    // MARK: - Subviews

    private var button = PKPaymentButton(paymentButtonType: .buy, paymentButtonStyle: .black)
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let statusLabel = UILabel()
    private var session: JupicoWalletSession?
    private var reloadScheduled = false

    private static let statusHeight: CGFloat = 24
    private static let supportedNetworks = ["visa", "mastercard", "amex", "discover"]

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setUp()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 1
        statusLabel.adjustsFontSizeToFitWidth = true
        addSubview(statusLabel)
        spinner.hidesWhenStopped = true
        rebuildButton()
        scheduleReload()
    }

    open override func layoutSubviews() {
        super.layoutSubviews()
        let h = Self.statusHeight
        let buttonHeight = max(bounds.height - h, 0)
        button.frame = CGRect(x: 0, y: 0, width: bounds.width, height: buttonHeight)
        spinner.center = CGPoint(x: bounds.midX, y: buttonHeight / 2)
        statusLabel.frame = CGRect(x: 0, y: buttonHeight, width: bounds.width, height: h)
    }

    open override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: 50 + Self.statusHeight)
    }

    private func rebuildButton() {
        button.removeFromSuperview()
        button = PKPaymentButton(paymentButtonType: .buy, paymentButtonStyle: buttonStyle)
        button.addTarget(self, action: #selector(handleTap), for: .touchUpInside)
        addSubview(button)
        spinner.removeFromSuperview()
        addSubview(spinner)
        render()
        setNeedsLayout()
    }

    // MARK: - Session → status

    /// Inputs can be set in any order (RN sets props one by one), so collapse
    /// them into a single reload on the next run loop. This also guarantees the
    /// handlers are attached before the first `statusChange` fires.
    private func scheduleReload() {
        guard !reloadScheduled else { return }
        reloadScheduled = true
        DispatchQueue.main.async { [weak self] in
            self?.reloadScheduled = false
            self?.reload()
        }
    }

    private func reload() {
        guard status != .processing else { return }
        guard let sessions = sessions else {
            session = nil
            setStatus(.unavailable, "Waiting for session")
            return
        }
        guard let decoded = JupicoWalletSession.decode(sessions, wallet: "applePay") else {
            session = nil
            setStatus(.unavailable, "No Apple Pay session")
            emitError("INVALID_SESSION", "sessions has no applePay entry.")
            return
        }
        if let err = decoded.error {
            session = nil
            setStatus(.unavailable, "Apple Pay unavailable for this merchant")
            emitError("INVALID_SESSION", (err["message"] as? String) ?? "Session error.", details: err)
            return
        }
        guard decoded.providerType == "vgs-applepay" || decoded.isSimulator else {
            session = nil
            setStatus(.unavailable, "Unsupported provider")
            emitError("INVALID_SESSION", "Unsupported Apple Pay provider: \(decoded.providerType ?? "none").")
            return
        }
        session = decoded
        if !decoded.isSimulator && !PKPaymentAuthorizationController.canMakePayments() {
            setStatus(.unavailable, "Apple Pay isn't available on this device")
            return
        }
        setStatus(disabled ? .disabled : .ready, nil)
    }

    // MARK: - Payment

    @objc private func handleTap() {
        guard let session = session, [.ready, .success, .failed, .cancelled].contains(status) else { return }
        setStatus(.processing, "Processing…")
        if session.isSimulator {
            presentSimulator(session)
        } else {
            presentApplePay(session)
        }
    }

    private func presentApplePay(_ session: JupicoWalletSession) {
        guard let merchantId = merchantIdentifier, !merchantId.isEmpty else {
            fail(code: "INVALID_CONFIGURATION", message: "merchantIdentifier is required for Apple Pay.")
            return
        }
        let config: [String: Any] = [
            "currencyCode": session.currencyCode,
            "totalLabel": session.description ?? "Payment Total",
            "totalAmount": session.amount ?? "",
            "supportedNetworks": Self.supportedNetworks,
            "apple": [
                "merchantIdentifier": merchantId,
                "countryCode": session.countryCode,
                "merchantCapabilities": ["3ds"],
                "requiredBillingContactFields": ["postalAddress", "name", "email", "phone"],
            ],
        ]
        ApplePayCore.shared.requestPayment(config: config) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let payload):
                    self?.complete(token: payload["token"] as? String ?? "",
                                   cardNetwork: payload["cardNetwork"] as? String,
                                   cardDetails: payload["cardDetails"] as? String,
                                   simulated: false)
                case .failure(let err):
                    self?.fail(code: err.code, message: err.message)
                }
            }
        }
    }

    /// `provider.type == "simulator"`: a stand-in sheet so the flow can be
    /// demoed without a card in Wallet (the web component has the same mode).
    private func presentSimulator(_ session: JupicoWalletSession) {
        guard let presenter = topViewController() else {
            fail(code: "PAYMENT_FAILED", message: "No view controller to present from.")
            return
        }
        let alert = UIAlertController(
            title: "Apple Pay · Simulator",
            message: "\(session.description ?? "Payment")\n\(formattedAmount(session))\n\nTest card: Visa ••1111",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Pay", style: .default) { [weak self] _ in
            let fake: [String: Any] = [
                "simulator": true,
                "tokenSessionId": session.tokenSessionId ?? "",
                "card": "visa-1111",
                "createdAt": ISO8601DateFormatter().string(from: Date()),
            ]
            let data = (try? JSONSerialization.data(withJSONObject: fake)) ?? Data()
            self?.complete(token: data.base64EncodedString(), cardNetwork: "Visa",
                           cardDetails: "Visa 1111", simulated: true)
        })
        alert.addAction(UIAlertAction(title: "Decline", style: .destructive) { [weak self] _ in
            self?.fail(code: "PAYMENT_FAILED", message: "Card declined (simulated).")
        })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.fail(code: "CANCELLED", message: "The user cancelled the payment.")
        })
        presenter.present(alert, animated: true)
    }

    private func complete(token: String, cardNetwork: String?, cardDetails: String?, simulated: Bool) {
        setStatus(.success, "✓ Payment authorized")
        var wallet: [String: Any] = ["platform": "apple-pay", "simulated": simulated]
        wallet["cardNetwork"] = cardNetwork
        wallet["cardDetails"] = cardDetails
        wallet["tokenSessionId"] = session?.tokenSessionId
        // Same shape the web component passes to transactionComplete. In this
        // proof of concept `data` is the wallet token; once the VGS one-time
        // token call is wired in it becomes the Jupico OTT.
        transactionComplete?([
            "oneTimeToken": ["paymentToken": ["data": token]],
            "wallet": wallet,
        ])
    }

    private func fail(code: String, message: String) {
        if code == "CANCELLED" {
            setStatus(.cancelled, "Payment cancelled")
        } else {
            setStatus(.failed, "✕ \(message)")
        }
        emitError(code, message)
    }

    // MARK: - Helpers

    private func emitError(_ code: String, _ message: String, details: [String: Any]? = nil) {
        var error: [String: Any] = details ?? [:]
        error["code"] = code
        error["message"] = message
        submitError?(["error": error])
    }

    private func setStatus(_ s: JupicoWalletStatus, _ message: String?) {
        status = s
        statusMessage = message
        render()
        var payload: [String: Any] = ["status": s.rawValue]
        payload["message"] = message
        statusChange?(payload)
    }

    private func render() {
        let interactive = [.ready, .success, .failed, .cancelled].contains(status)
        button.isEnabled = interactive
        button.alpha = (status == .disabled || status == .unavailable || status == .processing) ? 0.4 : 1
        button.isHidden = status == .unavailable && session == nil
        status == .processing ? spinner.startAnimating() : spinner.stopAnimating()
        statusLabel.text = statusMessage
        switch status {
        case .success: statusLabel.textColor = .systemGreen
        case .failed: statusLabel.textColor = .systemRed
        default: statusLabel.textColor = .systemGray
        }
    }

    private func formattedAmount(_ session: JupicoWalletSession) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = session.currencyCode
        let n = NSDecimalNumber(string: session.amount ?? "0")
        return f.string(from: n == .notANumber ? 0 : n) ?? "\(session.amount ?? "") \(session.currencyCode)"
    }

    private func topViewController() -> UIViewController? {
        var vc = window?.rootViewController
        while let presented = vc?.presentedViewController { vc = presented }
        return vc
    }
}

/// SwiftUI wrapper: `ApplePayJupico(sessions:merchantIdentifier:transactionComplete:submitError:)`.
@available(iOS 13.0, *)
public struct ApplePayJupico: UIViewRepresentable {
    public var sessions: [String: Any]?
    public var merchantIdentifier: String
    public var disabled: Bool
    public var transactionComplete: ([String: Any]) -> Void
    public var submitError: ([String: Any]) -> Void
    public var statusChange: ([String: Any]) -> Void

    public init(sessions: [String: Any]?,
                merchantIdentifier: String,
                disabled: Bool = false,
                transactionComplete: @escaping ([String: Any]) -> Void,
                submitError: @escaping ([String: Any]) -> Void,
                statusChange: @escaping ([String: Any]) -> Void = { _ in }) {
        self.sessions = sessions
        self.merchantIdentifier = merchantIdentifier
        self.disabled = disabled
        self.transactionComplete = transactionComplete
        self.submitError = submitError
        self.statusChange = statusChange
    }

    public func makeUIView(context: Context) -> ApplePayJupicoView {
        let view = ApplePayJupicoView()
        updateUIView(view, context: context)
        return view
    }

    public func updateUIView(_ view: ApplePayJupicoView, context: Context) {
        view.transactionComplete = transactionComplete
        view.submitError = submitError
        view.statusChange = statusChange
        view.merchantIdentifier = merchantIdentifier
        view.disabled = disabled
        if (view.sessions as NSDictionary?) != (sessions as NSDictionary?) {
            view.sessions = sessions
        }
    }
}
