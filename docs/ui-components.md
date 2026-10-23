# Wallet UI components (proof of concept)

The native equivalent of the web components `<apple-pay-jupico>` and
`<google-pay-jupico>`. On the web the source of truth is the bundle on the CDN;
on mobile it is **one native view per platform**, and every way of consuming it
(Swift, SwiftUI, Kotlin, React Native) is a thin wrapper around that view.

| | Web | iOS (source of truth) | Android (source of truth) | React Native |
|---|---|---|---|---|
| Tag | `<apple-pay-jupico>` / `<google-pay-jupico>` | `ApplePayJupicoView` (UIKit) · `ApplePayJupico` (SwiftUI) | `GooglePayJupicoView` | `<ApplePayJupico>` / `<GooglePayJupico>` |
| Input | `.sessions` | `sessions` | `sessions` | `sessions` |
| Success | `.transactionComplete({oneTimeToken})` | `transactionComplete` | `transactionComplete` | `transactionComplete` |
| Failure | `submit-error` event | `submitError` | `submitError` | `onSubmitError` |
| Every scenario | — | `statusChange` + text in the component | `statusChange` + text in the component | `onStatusChange` + text in the component |

## How it works

```
merchant backend ──POST /v1/sessions/browser/authorize──▶ Jupico
        │  data.sessions  ({ data: "<base64>" })
        ▼
app ──sessions──▶ [ Jupico wallet view ]
                     1. decodes sessions.applePay / sessions.googlePay
                     2. decides what to show → statusChange(ready | unavailable | …)
                     3. tap → native sheet (or simulator sheet)
                     4a. authorized → transactionComplete({ oneTimeToken })
                     4b. declined / cancelled / bad session → submitError({ error })
app ──oneTimeToken──▶ merchant backend ──▶ Jupico sale
```

The component never charges. Like the web, it hands the host a token and the
host's backend runs the sale.

### Inputs

- `sessions`: `data.sessions` from the authorize call, passed through as-is.
  `{ data: "<base64 JSON>" }` and an already-decoded
  `{ applePay: {...}, googlePay: {...} }` are both accepted.
  - `provider.type`: `vgs-applepay` / `vgs-googlepay` (real sheet) or `simulator`.
  - `amount`, `description`, `currencyCode`, `countryCode`: what the sheet shows.
  - `error`: the backend refused this wallet. The component reports it through `submitError`.
- `merchantIdentifier` (iOS only): the Apple Pay merchant ID in the app's
  entitlement. The web does this step on the server; native PassKit needs it in the app.
- `amount` (Android only): overrides the session amount, like the web attribute.
- `disabled`, `buttonStyle` (iOS), `buttonTheme` (Android).

### Outputs

**`transactionComplete`** — success
```json
{
  "oneTimeToken": { "paymentToken": { "data": "<token>" } },
  "wallet": { "platform": "apple-pay", "simulated": false, "cardNetwork": "Visa", "cardDetails": "Visa 1234", "tokenSessionId": "…" }
}
```
`oneTimeToken` has the same shape as on the web. **POC limitation:** `data` is
currently the raw wallet token. Once the VGS one-time-token call is wired in it
becomes the Jupico OTT, and client code does not change.

**`submitError`** — failure
```json
{ "error": { "code": "CANCELLED", "message": "The user cancelled the payment." } }
```
Codes: `CANCELLED`, `PAYMENT_FAILED`, `INVALID_SESSION`,
`INVALID_CONFIGURATION`, `NO_ELIGIBLE_CARDS`, `UNSUPPORTED_DEVICE`.

**`statusChange`** — every scenario, also rendered under the button

| status | shown in the component |
|---|---|
| `ready` | button enabled |
| `unavailable` | "Apple Pay isn't available on this device" / "Waiting for session" … |
| `disabled` | dimmed button |
| `processing` | spinner + "Processing…" |
| `success` | "✓ Payment authorized" (green) |
| `failed` | "✕ <reason>" (red) |
| `cancelled` | "Payment cancelled" |

After `success`, `failed` or `cancelled` the button stays enabled so the user can retry.

## Integrating as a client

### React Native

```tsx
import { ApplePayJupico, GooglePayJupico } from '@jupico/react-native-wallets';

const sessions = await myBackend.createJupicoSession(); // returns data.sessions

const onComplete = ({ oneTimeToken }) =>
  myBackend.sale({ oneTimeToken: oneTimeToken.paymentToken.data });
const onError = ({ error }) => {
  if (error.code !== 'CANCELLED') showToast(error.message);
};

{Platform.OS === 'ios' ? (
  <ApplePayJupico
    sessions={sessions}
    merchantIdentifier="merchant.com.yourapp"
    transactionComplete={onComplete}
    onSubmitError={onError}
  />
) : (
  <GooglePayJupico sessions={sessions} transactionComplete={onComplete} onSubmitError={onError} />
)}
```

Default size is full width × 80pt: 56pt button plus the status line. Override it with `style`.

### Swift (UIKit)

```swift
import JupicoWalletsCore

let pay = ApplePayJupicoView()
pay.merchantIdentifier = "merchant.com.yourapp"
pay.transactionComplete = { result in /* send result["oneTimeToken"] to your backend */ }
pay.submitError = { payload in /* payload["error"] */ }
pay.statusChange = { payload in /* optional */ }
pay.sessions = sessionsFromBackend      // [String: Any]
view.addSubview(pay)                    // give it ~80pt of height
```

### SwiftUI

```swift
ApplePayJupico(
    sessions: sessions,
    merchantIdentifier: "merchant.com.yourapp",
    transactionComplete: { result in … },
    submitError: { payload in … }
)
.frame(height: 80)
```

### Kotlin

```kotlin
val pay = GooglePayJupicoView(this).apply {
    transactionComplete = { result -> /* result["oneTimeToken"] → backend */ }
    submitError = { payload -> /* payload["error"] */ }
    sessions = sessionsFromBackend      // Map<String, Any?>
}
container.addView(pay, LayoutParams(MATCH_PARENT, dp(80)))

// Google Pay reports back through the Activity:
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (!GooglePayJupicoView.dispatchActivityResult(requestCode, resultCode, data)) {
        super.onActivityResult(requestCode, resultCode, data)
    }
}
```

## Host app setup

- **iOS:** Apple Pay capability, plus the merchant ID in `com.apple.developer.in-app-payments`.
  That ID's Payment Processing Certificate must be the one the token processor (VGS) decrypts with.
- **Android:** nothing extra. The `com.google.android.gms.wallet.api.enabled`
  meta-data merges from the library manifest.

## Not in the proof of concept yet

Needed to reach web parity:

1. Session validation (`/api/v1/tokenization/session/browser/validate`).
2. Sending the wallet token to the VGS one-time-token route, so `transactionComplete` returns a real Jupico OTT.
3. reCAPTCHA or another native attestation for those calls.
