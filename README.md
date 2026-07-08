# @jupico/react-native-wallets

A unified wrapper for **Apple Pay (PassKit)** and **Google Pay** that works in
**React Native** *and* in **standalone native apps** (Swift/Obj-C or Kotlin/Java).

This is a **native-first** SDK (not a WebView wrapper of Apple Pay JS / Google
Pay Web). It uses PassKit on iOS and `play-services-wallet` on Android.

## Why the layout is the way it is

The SDK is built in **three layers**, and the trick that satisfies both
"works in RN" and "works in a native-only app" is the **dependency direction**:

```
┌─────────────────────────────────────────────┐
│ Layer 3 — TypeScript facade  (src/)          │  ← RN clients import this
│   isSupported() canMakePayments() requestPayment()
├─────────────────────────────────────────────┤
│ Layer 2 — RN bridge  (thin, no logic)        │  ← marshals JS <-> native
│   ios/bridge/*  •  android/.../JupicoWalletsModule.kt
├─────────────────────────────────────────────┤
│ Layer 1 — Native cores  (NO RN dependency)   │  ← the real payment work
│   ios/core/ApplePayCore.swift                │
│   android/.../core/GooglePayCore.kt          │
└─────────────────────────────────────────────┘
```

- **Native-only apps** depend on Layer 1 directly (the `JupicoWalletsCore` pod /
  the `:core` Gradle sources). No React Native is pulled in.
- **React Native apps** install this npm package, whose bridge (Layer 2) calls
  the *same* Layer 1 cores.

One source of truth for the payment logic, two consumption paths. If you ever
find payment logic creeping into Layer 2, it belongs in Layer 1.

## Install (React Native)

```sh
npm install @jupico/react-native-wallets
cd ios && pod install
```

Requires the New Architecture (Turbo Modules). See [docs/react-native.md](docs/react-native.md).

## Usage (React Native)

```ts
import {
  isSupported,
  canMakePayments,
  requestPayment,
  WalletError,
  type PaymentRequest,
} from '@jupico/react-native-wallets';

const request: PaymentRequest = {
  currencyCode: 'USD',
  lineItems: [{ label: 'Coffee', amount: '4.50' }],
  totalLabel: 'Jupico',
  totalAmount: '4.50',
  supportedNetworks: ['visa', 'mastercard', 'amex'],
  tokenization: {
    type: 'gateway',
    gateway: 'stripe',
    parameters: { 'stripe:version': '2024-06-20', 'stripe:publishableKey': 'pk_live_...' },
  },
  apple: { merchantIdentifier: 'merchant.team.jupico', countryCode: 'US' },
  google: { merchantName: 'Jupico', environment: 'TEST' },
};

async function pay() {
  if (!(await canMakePayments(request))) return;
  try {
    const { token, platform } = await requestPayment(request);
    // Send `token` to YOUR backend → PSP to actually charge. Never charge on-device.
    await fetch('https://api.jupico.team/charge', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'CANCELLED') return; // user closed sheet
    throw e;
  }
}
```

## The token → who charges the card?

`requestPayment` returns an **opaque payment token**. Your backend forwards it to
your PSP (Stripe/Adyen/Braintree/...) which charges the card. With `gateway`
tokenization you stay **out of PCI scope**. `direct` tokenization means you
decrypt the token yourself and take on serious PCI DSS obligations — avoid unless
you know exactly why. This choice must match your Apple Pay Payment Processing
Certificate and Google Pay tokenization spec.

## Consuming from a native-only app

- iOS: [docs/native-ios.md](docs/native-ios.md)
- Android: [docs/native-android.md](docs/native-android.md)

## Status

`0.1.0` — scaffold with working Apple Pay + Google Pay flows. Not yet published.
See [docs/roadmap.md](docs/roadmap.md) for the remaining phases (sandbox testing,
Google production approval, event emitter for dynamic shipping, distribution).
