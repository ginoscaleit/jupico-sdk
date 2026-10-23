import Foundation
import PassKit
import React

/// Layer 2 UI bridge — exposes `ApplePayJupicoView` (Layer 1) to React Native as
/// `<ApplePayJupico>`. Holds NO payment or UI logic: it only maps RN props and
/// event blocks onto the native view's inputs and handlers.
@objc(ApplePayJupicoViewManager)
final class ApplePayJupicoViewManager: RCTViewManager {
    override static func requiresMainQueueSetup() -> Bool { true }
    override func view() -> UIView! { RNApplePayJupicoView() }
}

@objc(RNApplePayJupicoView)
final class RNApplePayJupicoView: ApplePayJupicoView {
    @objc var onTransactionComplete: RCTDirectEventBlock?
    @objc var onSubmitError: RCTDirectEventBlock?
    @objc var onStatusChange: RCTDirectEventBlock?

    @objc var buttonStyleName: NSString = "black" {
        didSet {
            switch buttonStyleName {
            case "white": buttonStyle = .white
            case "whiteOutline": buttonStyle = .whiteOutline
            case "automatic":
                if #available(iOS 14.0, *) { buttonStyle = .automatic } else { buttonStyle = .black }
            default: buttonStyle = .black
            }
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        transactionComplete = { [weak self] in self?.onTransactionComplete?($0) }
        submitError = { [weak self] in self?.onSubmitError?($0) }
        statusChange = { [weak self] in self?.onStatusChange?($0) }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}
