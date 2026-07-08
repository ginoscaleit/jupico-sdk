# React Native integration

## New Architecture

This library is authored as a Turbo Module. The host app must have the New
Architecture enabled (default in RN 0.76+). Autolinking wires up both the
`JupicoWallets` pod (iOS) and the `JupicoWalletsPackage` (Android).

### iOS host setup

1. `cd ios && pod install`
2. Add the **Apple Pay capability** and your **Merchant ID** to the host app
   target in Xcode (Signing & Capabilities). The SDK cannot do this for you —
   entitlements live in the consuming app.

### Android host setup

The `<meta-data com.google.android.gms.wallet.api.enabled>` tag ships in the
library manifest and merges automatically. Ensure `minSdkVersion >= 21`.

## API

| Function | Purpose |
| --- | --- |
| `activeWallet()` | `'apple-pay' \| 'google-pay' \| 'unsupported'` for the current OS. |
| `isSupported()` | Coarse capability check; safe on mount. |
| `canMakePayments(request)` | Fine-grained check for a specific cart (Apple `canMakePayments(usingNetworks:)` / Google `IsReadyToPay`). |
| `requestPayment(request)` | Presents the native sheet; resolves with `{ token, platform }` or rejects with a `WalletError`. |

## Error handling

Every rejection is a `WalletError` with a stable `code`:
`CANCELLED`, `UNSUPPORTED_DEVICE`, `NO_ELIGIBLE_CARDS`, `INVALID_CONFIGURATION`,
`NETWORK_ERROR`, `PAYMENT_FAILED`, `UNKNOWN`. The same codes are emitted by both
native platforms, so your handling code is platform-agnostic.

## Migrating to pure Codegen (optional)

Today the iOS bridge uses `RCT_EXTERN_MODULE` (works under New Arch via interop).
To go fully Codegen-native, implement the generated `NativeJupicoWalletsSpec`
protocol in place of `ios/bridge/JupicoWallets.mm` — the Swift core stays
untouched. `src/NativeJupicoWallets.ts` is already the Codegen spec.
