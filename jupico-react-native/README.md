# @jupico/react-native-wallets

Jupico's Apple Pay and Google Pay components for React Native. They are the
native counterparts of the web components `<apple-pay-jupico>` and
`<google-pay-jupico>`, with the same inputs, steps, payloads and outputs, so a
merchant's backend and handlers work the same on web and mobile.

| | Web component | React Native |
|---|---|---|
| Tag | `<apple-pay-jupico>` / `<google-pay-jupico>` | `<ApplePayJupico>` / `<GooglePayJupico>` |
| Session | `.sessions` | `sessions` |
| Success | `.transactionComplete({ oneTimeToken })` | `transactionComplete({ oneTimeToken })` |
| Failure | `submit-error` → `{ error }` | `onSubmitError({ error })` |
| Every state | — | `onStatusChange({ status, message })`, also shown inside the component |

This package is React Native only. Native-only (Swift/Kotlin) apps are out of
scope for now; the earlier research for those lives at the repo root.

**Contents**

- [How it works](#how-it-works)
- [Client guide](#client-guide): install, integrate, props, statuses, errors
- [Merchant onboarding & app requirements](ONBOARDING.md): Apple Merchant ID and certificate, Google Pay approval, why there is no `.well-known`
- [Known gaps](#known-gaps-v01)
- [Architecture](#architecture-for-maintainers): how the SDK is built, for maintainers
- [Development](#development) and [Publishing](#publishing)

---

## How it works

```
merchant backend ── POST /v1/sessions/browser/authorize ──▶ Jupico
        │ data.sessions
        ▼
<ApplePayJupico sessions=…>                       (same steps as the web component)
  1. decode sessions.applePay   (base64 `data` envelope or already decoded)
  2. POST hosted-api /tokenization/session/browser/validate  → show the button
  3. tap → native Apple Pay / Google Pay sheet
  4. wallet token → VGS proxy /tokenization/creditcard/onetimetoken → Jupico OTT
  5. transactionComplete({ oneTimeToken: { paymentToken: { data } } })
        │
        ▼
merchant backend ── sale(oneTimeToken) ──▶ Jupico
```

The component never charges. Like on the web, it hands the app a one-time
token, and the merchant's backend runs the sale with it. Jupico API
credentials never go in the app.

`provider.type: "simulator"` sessions (non-production) work like on the web:
- **Apple Pay** opens a test sheet with a test-card picker. It posts to
  hosted-api's simulator OTT route, so it works on any device and needs no card in Wallet.
- **Google Pay** uses Google's TEST environment and the normal VGS route.

---

## Client guide

### 1. Install

```sh
npm install @jupico/react-native-wallets
cd ios && pod install
```

React Native autolinking wires up the native code: the podspec on iOS, and the
`android/` module plus its manifest entry on Android. Rebuild the app afterwards
(`npx react-native run-ios` / `run-android`); a JavaScript reload is not enough.

- **Expo:** the package does not work in Expo Go. Use a development build (`npx expo prebuild`).
- **Requirements:** React Native with `react` / `react-native` as peer
  dependencies; tested on RN 0.76 with the New Architecture. iOS 13+, Android minSdk 23.

### 2. Host app setup (once)

Full details, including the Apple Pay certificate step and Google's production
approval, are in [ONBOARDING.md](ONBOARDING.md).

- **iOS:** in Xcode → Signing & Capabilities, add **Apple Pay** and select your Merchant ID
  (`com.apple.developer.in-app-payments`). Pass the same ID as `merchantIdentifier`.
- **Android:** nothing. The Google Pay meta-data merges from this library's
  manifest. Google must approve the app before you can use `PRODUCTION`.

### 3. Backend: create a session per checkout

Sessions expire after about 15 minutes, so create one when the checkout screen opens.

```ts
const r = await fetch('https://sandbox-platform.jupico.com/v1/sessions/browser/authorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Basic ${base64(user + ':' + pass)}` },
  body: JSON.stringify({
    subMerchantId: 'your-submerchant-id',
    applePay:  { enabled: true, amount: 4.9, description: 'Order 123' },
    googlePay: { enabled: true, amount: 4.9, description: 'Order 123' },
  }),
});
res.json({ sessions: (await r.json()).data.sessions }); // pass through untouched
```

This is the same call as for the web components, so an existing backend works unchanged.

### 4. App: render the component

```tsx
import { Platform } from 'react-native';
import { ApplePayJupico, GooglePayJupico } from '@jupico/react-native-wallets';

const onComplete = async ({ oneTimeToken }) => {
  await api.post('/checkout/pay', { oneTimeToken: oneTimeToken.paymentToken.data });
};
const onError = ({ error }) => {
  if (error.code !== 'CANCELLED') Alert.alert('Payment problem', error.message);
};

{Platform.OS === 'ios' ? (
  <ApplePayJupico
    sessions={sessions}
    merchantIdentifier="merchant.com.yourcompany"
    transactionComplete={onComplete}
    onSubmitError={onError}
  />
) : (
  <GooglePayJupico sessions={sessions} transactionComplete={onComplete} onSubmitError={onError} />
)}
```

You don't build any loading, unavailable, processing, success or failure UI. The
component shows each of those under its button. Use `onStatusChange` only when
the rest of the screen should react.

### 5. Backend: charge

Send `oneTimeToken` to Jupico's sale API from your server, the same as after the web components.

### Props

| Prop | Component | Notes |
|---|---|---|
| `sessions` | both | `data.sessions` from authorize: `{ data: base64 }` or decoded |
| `transactionComplete` | both | `({ oneTimeToken: { paymentToken: { data } } })` |
| `onSubmitError` | both | `({ error: { code, message, …details } })` |
| `onStatusChange` | both | `({ status, message? })` |
| `disabled` | both | Dims the button and ignores taps |
| `getReCaptchaToken` | both | `() => Promise<string>`; see [Known gaps](#known-gaps-v01) |
| `onLog` | both | `(entry: WalletLogEntry) => void`, a step-by-step trace; see [Tracing](#tracing-onlog) |
| `debug` | both | Also print the trace with `console.log` |
| `style` | both | Container style. The button is 50pt high, with the status line below it |
| `merchantIdentifier` | Apple | Required. Must match your Apple Pay entitlement |
| `buttonType`, `buttonStyle`, `cornerRadius` | Apple | `buy` / `black` / `6` by default |
| `amount` | Google | Overrides the session amount, like the web `amount` attribute |
| `buttonTheme`, `buttonType` | Google | `dark` / `pay` by default |

### Statuses

Each status is rendered under the button and also emitted through `onStatusChange`.

| status | shown |
|---|---|
| `loading` | spinner, "Validating session…" |
| `ready` | button enabled |
| `unavailable` | Reason: no session, wallet not available on the device, or session refused or expired |
| `disabled` | dimmed button |
| `processing` | spinner, "Processing…" |
| `success` | "✓ Payment authorized" |
| `failed` | "✕ reason" |
| `cancelled` | "Payment cancelled" |

After `success`, `failed` or `cancelled`, the button stays enabled so the user can try again.

### Tracing (`onLog`)

Pass `onLog` to see everything a component receives, sends and emits, in order.
Each entry is `{ time, wallet, kind, message, data? }`:

| kind | What it records |
|---|---|
| `input` | The props received, and the session decoded from them |
| `step` | A decision: simulator vs live session, button tapped, user authorized… |
| `request` / `response` | Each HTTP call to Jupico / VGS: URL and body, then status, duration and body |
| `native` | Each native call (`→`), its result (`←`) or its rejection (`✕`) |
| `status` | Each status change |
| `output` | `transactionComplete` / `onSubmitError` being called, with their payloads |

A failed session validation looks like this:

```
input    props { sessions, merchantIdentifier, disabled }
input    decoded sessions.applePay { provider, tokenSessionId, amount, … }
step     live session: checking the device
native   → canMakeApplePayments ["visa","masterCard","amex","discover"]
native   ← canMakeApplePayments true
status   → loading "Validating session…"
request  POST https://sandbox-payments-hosted-api.jupico.com/api/v1/tokenization/session/browser/validate
response HTTP 500 in 1086ms { success: false, message: "…" }
status   → unavailable "Session could not be validated"
output   onSubmitError(INVALID_SESSION)
```

Values longer than 80 characters (tokens, cryptograms) are truncated, and
email and phone numbers are masked. The trace still contains billing names and
addresses, so use it for integration and support, not for production analytics.
`debug` prints the same entries to the console.

### Error codes

| code | meaning |
|---|---|
| `CANCELLED` | The user closed the sheet. Usually ignore it. |
| `INVALID_SESSION` | The session is missing, malformed, expired, or the wallet isn't enabled for the sub-merchant |
| `INVALID_CONFIGURATION` | A prop is missing, e.g. `merchantIdentifier` |
| `TOKENIZATION_FAILED` | Jupico or VGS rejected the wallet token |
| `PAYMENT_FAILED` | The wallet sheet failed |
| `NETWORK_ERROR` | No response |

---

## Known gaps (v0.1)

1. **Apple Pay certificate.** PassKit encrypts the token for the app's Merchant
   ID. The VGS Apple Pay route has to decrypt with that Merchant ID's Payment
   Processing Certificate. The web uses Jupico's server-side Merchant ID
   (`APPLE_PAY_MERCHANT_IDENTIFIER` in hosted-api), so Jupico needs to confirm,
   or upload, the certificate for the ID used in apps. Until then, live Apple Pay
   may fail at `TOKENIZATION_FAILED`. The simulator is unaffected.
2. **reCAPTCHA.** Jupico's one-time-token route requires a non-empty
   `reCaptchaToken`, and browsers get it from reCAPTCHA Enterprise. Native apps
   have no browser token, so without `getReCaptchaToken` the SDK sends the
   marker `react-native-sdk`; the web simulator does the same with
   `'simulator token'`. Server-side verification is currently log-only, so this
   passes. Jupico should choose a native attestation (reCAPTCHA Enterprise mobile
   SDK, App Attest, or Play Integrity) before production.
3. **Device fingerprint.** The web sends an optional ThumbmarkJS
   `deviceFingerprint` on validate. The native SDK does not send one yet.
4. **Not yet verified end to end** with a real sandbox session on a device.
   Builds, unit tests, and a simulator run up to the sandbox validate call are verified.

---

## Architecture (for maintainers)

### Design principle: native does only what JavaScript can't

The goal is "the web components, but native", so the SDK copies their behaviour
and changes only what a browser does differently:

| Job | Web component | This SDK |
|---|---|---|
| Read the session, call Jupico, build request bodies | JavaScript in the `.vue` file | **TypeScript** (`src/`), ported almost line for line |
| Draw the wallet button | `<apple-pay-button>` / `<google-pay-button>` | **Native**: `PKPaymentButton` (iOS), `PayButton` (Android) |
| Open the payment sheet | `ApplePaySession` / Google Pay JS | **Native**: PassKit (iOS), Google Pay API (Android) |

Everything Jupico-specific (URLs, payloads, session decoding, statuses, errors)
is TypeScript shared by both platforms. That gives:
- **One place to change Jupico logic.** A new endpoint is one edit, not one per platform.
- **A direct comparison with the web.** Each TypeScript file maps to a web-components file (see below).
- **Unit tests without a device.**

### File map

```
jupico-react-native/
├─ src/                          TypeScript: all Jupico logic + the components
│  ├─ index.ts                   public API (what clients import)
│  ├─ types.ts                   sessions, events, error codes, props
│  ├─ config.ts                  URLs + constants
│  ├─ session.ts                 decode `sessions`
│  ├─ api.ts                     HTTP calls to Jupico / VGS
│  ├─ payloads.ts                request + one-time-token bodies
│  ├─ native.ts                  the bridge to native code (+ traceNative)
│  ├─ logger.ts                  onLog trace: entry format, redaction
│  ├─ __tests__/logic.test.ts    unit tests for config / session / payloads
│  └─ components/
│     ├─ ApplePayJupico.tsx      <ApplePayJupico>
│     ├─ GooglePayJupico.tsx     <GooglePayJupico>
│     ├─ useWalletController.ts  state machine + the 3 outputs (shared)
│     ├─ WalletFrame.tsx         button + spinner + status line (shared)
│     └─ SimulatorSheet.tsx      Apple Pay test sheet
├─ ios/
│  ├─ JupicoRNWallets.swift      native module: Apple Pay availability + sheet
│  ├─ JupicoApplePayButton.swift native view: PKPaymentButton
│  └─ JupicoRNWallets.m          registers both Swift classes with React Native
├─ android/
│  ├─ build.gradle               adds play-services-wallet
│  └─ src/main/java/com/jupico/rnwallets/
│     ├─ JupicoRNWalletsModule.kt         native module: Google Pay readiness + sheet
│     ├─ JupicoGooglePayButtonManager.kt  native view: PayButton
│     └─ JupicoRNWalletsPackage.kt        registers both with React Native
├─ JupicoReactNativeWallets.podspec       how CocoaPods installs ios/
├─ react-native.config.js                 declares the package for autolinking
├─ package.json                           npm package definition
└─ example/                               demo app (not published)
```

### Mapping to the web components

Source: `payments/repos/web-components/src`.

| Web | React Native |
|---|---|
| `config.ts` (`getDomain`, `buildVgsWalletUrl`, `buildPlatformOttUrl`) | `src/config.ts` |
| `data/enums.ts` (provider types, VGS gateway constants) | `src/config.ts` |
| `utils/encodingUtils.ts` `decodeBase64` + `decodedApplePay` / `decodedGooglePay` | `src/session.ts` `decodeWalletSession` |
| `apple-pay.ce.vue` `validateSession` | `src/api.ts` `validateSession` |
| `apple-pay.ce.vue` `new ApplePaySession(3, {...})` | `src/payloads.ts` `buildApplePayRequest` |
| `apple-pay.ce.vue` `onpaymentauthorized` → `ottPayload` | `src/payloads.ts` `buildApplePayOttBody` |
| `apple-pay.ce.vue` `SIMULATOR_CARDS`, `confirmSimulator` | `src/payloads.ts` `SIMULATOR_CARDS`, `buildSimulatorOttBody`; `SimulatorSheet.tsx` |
| `google-pay.ce.vue` `paymentRequest` | `src/payloads.ts` `buildGooglePayRequest` |
| `google-pay.ce.vue` `onLoadPaymentData` → `vgsPayload` | `src/payloads.ts` `buildGooglePayOttBody` |
| `transactionComplete({ oneTimeToken })` / `emit('submit-error')` | `useWalletController.ts` `complete` / `fail` |

Intentional differences from the web:
- **No Apple merchant validation call** (`/wallet/applepay/validatesession`).
  PassKit validates the merchant using the app's entitlement, so this call is web-only.
- **No `targetOrigins`** on validate: an app has no origin.
- **Google Pay total uses `session.amount`.** The web reads `provider.settings.amount`, which is never set.
- **Cancel emits `onSubmitError({ code: 'CANCELLED' })`.** The web emits nothing on cancel.
- **The status line and `onStatusChange` are additions.** The web has no equivalent.

### An Apple Pay payment, step by step

**When the component mounts** (`useEffect` in `ApplePayJupico.tsx`):

1. **Decode the session.** `decodeWalletSession(sessions, 'applePay')`:
   - if `sessions.data` is a string, it base64-decodes it and reads `.applePay`;
   - otherwise it uses `sessions.applePay` directly.

   It uses a built-in base64/UTF-8 decoder because `atob`/`TextDecoder` aren't
   guaranteed on every React Native engine.
2. **Check the session.**
   - Missing: status `unavailable`.
   - Has an `error` (wallet disabled for the sub-merchant): status `unavailable` plus `onSubmitError(INVALID_SESSION)`.
   - `provider.type` isn't `vgs-applepay` or `simulator`: rejected the same way.
3. **Ask the device.** Native `canMakeApplePayments`, which wraps PassKit's
   `canMakePayments(usingNetworks:)`. If it returns `false`, the status becomes
   "Apple Pay isn't available on this device".
4. **Validate with Jupico.** `validateSession()` sends
   `POST {hosted-api}/api/v1/tokenization/session/browser/validate` with
   `{ tokenSessionId, publicKey }`. The base URL comes from `session.environment`.
5. **Show the button.** The status becomes `ready` and the native button is shown.

**When the user taps** (`onPress` in `ApplePayJupico.tsx`):

6. **Build the request.** `buildApplePayRequest()` builds the same fields as the
   web: networks, `supports3DS`, total from `description` / `amount`, and the
   required contact fields.
7. **Open the sheet.** `NativeWallets.presentApplePay(request)`. Swift
   (`JupicoRNWallets.presentApplePay`) builds a `PKPaymentRequest`, presents the
   sheet, stores the promise and **waits**.
8. **The user authorizes.** Apple calls `didAuthorizePayment`. Swift:
   - converts the `PKPayment` into **the exact shape Apple Pay JS gives the web**,
     `{ token: { paymentData, paymentMethod, transactionIdentifier }, billingContact }`
     (`paymentDictionary`);
   - resolves the promise.

   **The sheet stays open:** Swift holds Apple's completion handler.
   Email and phone are requested as shipping fields, because Apple only returns
   them there, and are merged into `billingContact`.
9. **Get a Jupico one-time token.** `buildApplePayOttBody()` (the web's
   `ottPayload`) is posted by `requestOneTimeToken()` to `buildVgsWalletUrl()`.
   VGS decrypts the Apple token and forwards it to Jupico, which returns `data.oneTimeToken.data`.
10. **Close the sheet.** `completeApplePay(true)`: Swift calls the stored handler
    with `.success`, so Apple shows ✓ and closes the sheet. On any failure the SDK
    calls `completeApplePay(false)` and Apple shows ✗.
11. **Report the outcome.**
    - `complete(ott)` sets status `success` and calls `transactionComplete({ oneTimeToken: { paymentToken: { data } } })`.
    - Any exception goes to `fail(e)`, which sets status `failed` or `cancelled` and calls `onSubmitError`.

Steps 7 and 10 are deliberately separate. The web only calls
`session.completePayment(SUCCESS)` **after** the token call succeeds. Without
this split the sheet would show success before Jupico had accepted the token.

**Cancel:** closing the sheet without paying triggers
`paymentAuthorizationControllerDidFinish` without an authorization. Swift rejects
with `CANCELLED`, which becomes the status `cancelled` and `onSubmitError({ error: { code: 'CANCELLED' } })`.

### Google Pay: same structure, three differences

1. **The request JSON is built in TypeScript** (`buildGooglePayRequest`): the
   VGS gateway (`verygoodsecurity` / `ACgtnCohNkFmTpkULj2jaRvX`), the networks,
   and a required billing address. Kotlin receives it as a string and passes it
   straight to Google, so Kotlin knows nothing about Jupico.
2. **Android returns results through `onActivityResult`.**
   `JupicoRNWalletsModule` stores the pending promise and resolves it with
   `paymentData.toJson()` when the Activity result arrives. Cancel becomes `CANCELLED`.
3. **There's no "keep the sheet open" step.** Google closes its sheet itself, so
   the token call happens afterwards. `buildGooglePayOttBody` copies the web's
   `vgsPayload`, including the "Cardholder name is required…" check.

### The simulator

When `provider.type === "simulator"`, Apple Pay opens `SimulatorSheet.tsx`
instead of PassKit. It is a React Native modal with the web's 7 test cards.
"Click to Pay" posts `buildSimulatorOttBody()`, the web's `confirmSimulator`
body, to hosted-api's non-production OTT route. That returns a real sandbox
one-time token without Apple, so it needs no card in Wallet and also renders on
Android. Google Pay simulator sessions use Google's TEST environment, which is
what the web does in practice.

### How JavaScript talks to native code

React Native gives two tools; the SDK uses both.

**Native module**: functions that return promises.
- **iOS:** the Swift class `JupicoRNWallets` with `@objc` methods, registered in
  `JupicoRNWallets.m` through `RCT_EXTERN_MODULE` / `RCT_EXTERN_METHOD`. Swift
  can't register itself with React Native, which is why that small Objective-C file exists.
- **Android:** `JupicoRNWalletsModule` with `@ReactMethod` functions, listed in `JupicoRNWalletsPackage`.
- **JavaScript:** `NativeModules.JupicoRNWallets` (`src/native.ts`). If the
  module is missing because `pod install` wasn't run, any call throws a clear message.

| Method | Platform | Purpose |
|---|---|---|
| `canMakeApplePayments(networks)` | iOS | Is Apple Pay usable with these networks? |
| `presentApplePay(request)` | iOS | Show the sheet; resolve on authorization (sheet stays open) |
| `completeApplePay(success)` | iOS | Show ✓/✗ and close the sheet |
| `isGooglePayReady(json, env)` | Android | Google `IsReadyToPay` |
| `loadGooglePayPaymentData(json, env)` | Android | Show the sheet; resolve with PaymentData JSON |

**Native views**: the buttons.
- **iOS:** `JupicoApplePayButtonManager` creates a view wrapping `PKPaymentButton`.
  Props (`buttonType`, `buttonStyle`, `cornerRadius`) arrive as Swift properties.
- **Android:** `JupicoGooglePayButtonManager` does the same with `PayButton`
  (`@ReactProp` setters, a custom `Event` for taps).
- **JavaScript:** `requireNativeComponent('JupicoApplePayButton')` /
  `('JupicoGooglePayButton')` in `src/native.ts`. They are resolved lazily, so
  Android never looks for the iOS view.

Native details worth knowing:
- **The tap event is `onWalletPress`, not `onPress`.** React Native already
  registers `topPress` as a bubbling event, and reusing it crashes at startup.
- **Buttons are recreated when their options change.** `PKPaymentButton`'s type
  and style, and `PayButton`'s options, can only be set once.
- **The Android button re-lays itself out** (`requestLayout` override). React
  Native otherwise doesn't measure native child views added later, and the button stays invisible.
- **New Architecture:** these classic-style modules and views run on Fabric /
  bridgeless through React Native's interop layer. Migrating to Codegen TurboModules is optional.

**Autolinking** is why clients link nothing by hand. `react-native.config.js`
declares the package as native:
- **iOS:** `pod install` finds the podspec, which compiles `ios/**` and links PassKit.
- **Android:** Gradle includes `android/` and registers `JupicoRNWalletsPackage`.

### Shared state and UI

- **`useWalletController.ts`** is the single state machine both components use:
  `loading → ready → processing → success | failed | cancelled`, plus
  `unavailable` and `disabled`. The three outputs are emitted only here, so
  their shape can't drift between Apple and Google. It reads handlers through a
  `ref`, so clients can pass inline functions without re-running validation.
- **`toWalletError`** turns both JavaScript errors and native rejections
  (`{ code, message }`) into one `JupicoWalletError` with a stable code.
- **`WalletFrame.tsx`** draws what every scenario shares: a 50pt button area, a
  spinner during `loading` / `processing`, dimming when the button isn't
  tappable, and the coloured status line underneath.

### Packaging

- **`package.json`**
  - `react` / `react-native` are peer dependencies, so the app's versions are used.
  - `react-native-builder-bob` compiles `src/` into `lib/` (CommonJS, ES modules, `.d.ts` types) on `npm run prepare`, which `npm publish` runs automatically.
  - The `files` list ships `src`, `lib`, `ios`, `android`, the podspec and `react-native.config.js`, and leaves out tests and `example/` (check with `npm pack --dry-run`).
- **`JupicoReactNativeWallets.podspec`** compiles `ios/**`, links PassKit, and
  calls `install_modules_dependencies` for the right React dependencies.
- **`android/build.gradle`** adds `play-services-wallet:19.4.0`. The manifest's
  `com.google.android.gms.wallet.api.enabled` entry merges into the client app.

### Example app

`example/` is the demo used for TestFlight. Its screen has three steps:
1. **Session:** create a real sandbox session in the app (API credentials are
   typed in and kept in memory only), or paste one.
2. **Pay:** the component.
3. **Trace:** the component's `onLog` entries plus the app's own handler calls,
   filterable by Inputs / Network / Native / Status / Outputs / App. Tap an entry
   to show or hide its payload.

The example depends on the SDK through `"file:.."`, which is a symlink. Without
care, Metro loads `react-native` from the **SDK's** `node_modules` for SDK
files. That creates two React Native copies, and the native views register in
the wrong one ("View config getter callback … must be a function").
`example/metro.config.js` blocks the SDK's `node_modules` to prevent it.
Clients installing from npm are not affected.

### Where to change things

| You want to… | Edit |
|---|---|
| Change an endpoint or environment URL | `src/config.ts` |
| Change what is sent to Jupico / VGS | `src/payloads.ts` and its test |
| Add a card network | `src/payloads.ts`; also `network()` in `ios/JupicoRNWallets.swift` |
| Change status texts or colours | `useWalletController.ts`, `WalletFrame.tsx` |
| Add a button prop | the native view (Swift / Kotlin), `src/native.ts`, the component |
| Add a native capability | the module (Swift / Kotlin + `JupicoRNWallets.m`), the interface in `src/native.ts` |
| Wire a real reCAPTCHA | pass `getReCaptchaToken`; the fallback is `NATIVE_RECAPTCHA_MARKER` in `src/config.ts` |

---

## Development

```sh
npm install
npm test            # unit tests (session decoding, URLs, payloads)
npm run typecheck

cd example && npm install && cd ios && pod install && cd ..
npx react-native run-ios      # or run-android
```

What has been verified so far:

| Check | Result |
|---|---|
| `npm test` | 15 tests: session decoding (base64, URL-safe, UTF-8), URLs per environment, every request body compared with the web, trace redaction |
| `tsc` | SDK and example type-check |
| iOS | Builds. On the simulator, the native availability check and the real sandbox validate call worked, and the error status rendered |
| Android | Debug APK builds; not yet run on a device |
| End-to-end payment | Pending: needs sandbox API credentials and a device |

## Publishing

The package is not on npm yet. To publish:

1. Someone at Jupico owns the `@jupico` org on npmjs.com.
2. Bump `version` in `package.json`.
3. Run `npm publish --access public` from this folder. `prepare` rebuilds `lib/` first.

Clients then install with `npm install @jupico/react-native-wallets`.

For a pilot before publishing, `npm pack` produces
`jupico-react-native-wallets-<version>.tgz`. A merchant installs it with
`npm install ./jupico-react-native-wallets-<version>.tgz`, and the remaining steps stay the same.

Before a public release, update the podspec's `homepage` and `source` to the
final repository.
