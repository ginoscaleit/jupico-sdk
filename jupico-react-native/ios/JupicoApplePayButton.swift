import PassKit
import React
import UIKit

/// `JupicoApplePayButton` host view: Apple's official PKPaymentButton, which
/// Apple's guidelines require instead of a custom-drawn button.
@objc(JupicoApplePayButtonManager)
final class JupicoApplePayButtonManager: RCTViewManager {
    override static func requiresMainQueueSetup() -> Bool { true }
    override func view() -> UIView! { JupicoApplePayButtonView() }
}

final class JupicoApplePayButtonView: UIView {
    @objc var onWalletPress: RCTDirectEventBlock?
    @objc var buttonType: NSString = "buy" { didSet { rebuild() } }
    @objc var buttonStyle: NSString = "black" { didSet { rebuild() } }
    @objc var cornerRadius: CGFloat = 6 { didSet { button?.cornerRadius = cornerRadius } }

    private var button: PKPaymentButton?

    override init(frame: CGRect) {
        super.init(frame: frame)
        rebuild()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        button?.frame = bounds
    }

    // PKPaymentButton's type and style are fixed at init, so recreate it.
    private func rebuild() {
        button?.removeFromSuperview()
        let b = PKPaymentButton(paymentButtonType: Self.type(buttonType), paymentButtonStyle: Self.style(buttonStyle))
        b.cornerRadius = cornerRadius
        b.addTarget(self, action: #selector(tapped), for: .touchUpInside)
        b.frame = bounds
        addSubview(b)
        button = b
    }

    @objc private func tapped() {
        onWalletPress?([:])
    }

    private static func type(_ s: NSString) -> PKPaymentButtonType {
        switch s {
        case "plain": return .plain
        case "checkout": return .checkout
        case "book": return .book
        case "donate": return .donate
        case "subscribe": return .subscribe
        case "continue":
            if #available(iOS 15.0, *) { return .continue }
            return .buy
        case "order":
            if #available(iOS 15.0, *) { return .order }
            return .buy
        default: return .buy
        }
    }

    private static func style(_ s: NSString) -> PKPaymentButtonStyle {
        switch s {
        case "white": return .white
        case "whiteOutline": return .whiteOutline
        case "automatic":
            if #available(iOS 14.0, *) { return .automatic }
            return .black
        default: return .black
        }
    }
}
