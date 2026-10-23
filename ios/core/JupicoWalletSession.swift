import Foundation

/// The wallet entry of a Jupico `sessions` object, as returned by
/// `POST /v1/sessions/browser/authorize` and consumed by the web components.
///
/// `sessions` arrives either as `{ data: "<base64 JSON>" }` (the raw authorize
/// response) or already decoded as `{ applePay: {...}, googlePay: {...} }`.
/// Both shapes are accepted, exactly like `apple-pay-jupico` on the web.
public struct JupicoWalletSession {
    public let providerType: String?
    public let tokenSessionId: String?
    public let subMerchantPublicKey: String?
    public let environment: String?
    public let amount: String?
    public let description: String?
    public let countryCode: String
    public let currencyCode: String
    /// Present when the backend refused this wallet (e.g. feature disabled).
    public let error: [String: Any]?

    public var isSimulator: Bool { providerType == "simulator" }

    /// - Parameter wallet: `"applePay"` or `"googlePay"`.
    public static func decode(_ sessions: [String: Any]?, wallet: String) -> JupicoWalletSession? {
        guard let sessions = sessions else { return nil }
        var root = sessions
        if let encoded = sessions["data"] as? String {
            guard let decoded = decodeBase64JSON(encoded) else { return nil }
            root = decoded
        }
        guard let entry = root[wallet] as? [String: Any] else { return nil }
        let provider = entry["provider"] as? [String: Any]
        return JupicoWalletSession(
            providerType: provider?["type"] as? String,
            tokenSessionId: entry["tokenSessionId"] as? String,
            subMerchantPublicKey: entry["subMerchantPublicKey"] as? String,
            environment: entry["environment"] as? String,
            amount: stringValue(entry["amount"]),
            description: entry["description"] as? String,
            countryCode: (entry["countryCode"] as? String) ?? "US",
            currencyCode: (entry["currencyCode"] as? String) ?? "USD",
            error: entry["error"] as? [String: Any]
        )
    }

    /// URL-safe base64 → JSON object, mirroring web-components `decodeBase64`.
    static func decodeBase64JSON(_ s: String) -> [String: Any]? {
        var b64 = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }

    private static func stringValue(_ v: Any?) -> String? {
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return NSDecimalNumber(decimal: n.decimalValue).stringValue }
        return nil
    }
}

/// What the component is showing. Emitted through `statusChange` and rendered
/// inside the component for every scenario.
public enum JupicoWalletStatus: String {
    case ready, unavailable, disabled, processing, success, failed, cancelled
}
