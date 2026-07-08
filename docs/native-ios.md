# Using the Apple Pay core in a native-only iOS app

The core in `ios/core/ApplePayCore.swift` has **no React Native dependency**.
A Swift/Obj-C app consumes it via the `JupicoWalletsCore` CocoaPod.

## 1. Prerequisites (Phase 0)

- Apple Developer account.
- A **Merchant ID** (e.g. `merchant.team.jupico`).
- An **Apple Pay Payment Processing Certificate** — this is tied to your PSP, so
  choose the PSP first.
- Add the **Apple Pay capability** + entitlement to your app target.

## 2. Add the pod

```ruby
# Podfile
pod 'JupicoWalletsCore', :git => 'https://github.com/jupico/react-native-wallets.git', :tag => 'core-0.1.0'
```

```sh
pod install
```

## 3. Call it

```swift
import JupicoWalletsCore

let config: [String: Any] = [
  "currencyCode": "USD",
  "totalLabel": "Jupico",
  "totalAmount": "4.50",
  "lineItems": [["label": "Coffee", "amount": "4.50"]],
  "supportedNetworks": ["visa", "mastercard", "amex"],
  "apple": [
    "merchantIdentifier": "merchant.team.jupico",
    "countryCode": "US",
    "merchantCapabilities": ["3ds"],
  ],
]

ApplePayCore.shared.requestPayment(config: config) { result in
  switch result {
  case .success(let payload):
    let token = payload["token"] as! String  // base64 PKPaymentToken.paymentData
    // POST token to your backend → PSP.
  case .failure(let error):
    print(error.code, error.message)  // "CANCELLED", "NO_ELIGIBLE_CARDS", ...
  }
}
```

The `config` dictionary is the exact same shape the RN facade serializes, so the
two consumption paths never drift. If you prefer strong Swift types, wrap this
dictionary in your own struct — the core intentionally accepts a dictionary so
the RN bridge can forward JS objects verbatim.

## 4. Testing

- Use an Apple Pay **sandbox tester** account (App Store Connect → Sandbox).
- Test on a **real device** — the simulator's Apple Pay support is limited.
