# Merchant onboarding and app requirements

What a merchant's app needs before `<ApplePayJupico>` and `<GooglePayJupico>`
can take payments, and what Jupico has to do on its side.

**Short version:**
- The app needs **no runtime permissions** and **no `.well-known` file**.
- Apple and Google check the **app** instead of a domain:
  - **iOS:** an Apple Pay Merchant ID, its Payment Processing Certificate, and the Apple Pay capability.
  - **Android:** nothing for testing; Google's approval for production.

**Contents**

- [Why there is no `.well-known` file](#why-there-is-no-well-known-file)
- [iOS requirements](#ios-requirements)
- [Android requirements](#android-requirements)
- [Jupico-side setup per merchant](#jupico-side-setup-per-merchant)
- [Checklists](#checklists)
- [Open decisions for Jupico](#open-decisions-for-jupico)

---

## Why there is no `.well-known` file

On the web, Apple Pay JS checks that the page's **domain** is allowed to take payments:

1. The merchant's domain serves
   `/.well-known/apple-developer-merchantid-domain-association`, and the domain
   is registered with Jupico's Apple Merchant ID.
2. When the sheet opens, the browser asks for a merchant session. The web
   component calls hosted-api `POST /api/v1/wallet/applepay/validatesession`,
   which talks to Apple using **Jupico's** merchant certificate.

An app has no domain, so neither step exists in native apps. Apple and Google
verify the **app itself** through its code signature and entitlements:

| Check | Web | Native app |
|---|---|---|
| Who may show Apple Pay | Domain verification (`.well-known`) | App's Apple Pay entitlement + Merchant ID |
| Merchant session | hosted-api `validatesession` | Not needed; PassKit uses the entitlement |
| Who can decrypt the Apple Pay token | Jupico's Payment Processing Certificate | The **app's** Merchant ID certificate (see below) |
| Who may show Google Pay | Google Pay web integration | App approved in Google Pay & Wallet Console |
| Bot / fraud signal | Origin (`targetOrigins`) + reCAPTCHA | None yet (see [Open decisions](#open-decisions-for-jupico)) |

---

## iOS requirements

### What the merchant sets up

| Step | Where | Notes |
|---|---|---|
| 1. Create a **Merchant ID**, e.g. `merchant.com.clientapp` | Apple Developer → Certificates, Identifiers & Profiles → Identifiers | Must belong to the **same Apple Developer team** as the app |
| 2. Create the **Payment Processing Certificate** for that Merchant ID | Same Merchant ID → Apple Pay Payment Processing Certificate | Created from a **CSR supplied by Jupico/VGS**, not one the merchant generates. The resulting `.cer` goes back to Jupico. |
| 3. Enable the **Apple Pay** capability on the App ID, with that Merchant ID | Apple Developer → App ID, and Xcode → Signing & Capabilities | Adds `com.apple.developer.in-app-payments` to the app's entitlements |
| 4. **Regenerate the provisioning profile** | Apple Developer → Profiles | Profiles created before step 3 don't include Apple Pay, and the sheet won't open |
| 5. Pass the Merchant ID to the component | App code | `<ApplePayJupico merchantIdentifier="merchant.com.clientapp" …/>` |

Not needed:
- **Info.plist usage strings or permission prompts.** Apple Pay never asks the user for permission.
- **App Transport Security exceptions.** All Jupico and VGS endpoints are HTTPS.
- **A custom button.** The SDK uses Apple's official `PKPaymentButton`, as App Review requires.

### Why each merchant needs its own certificate

An iOS app can only use a Merchant ID that belongs to **its own** Apple team.
PassKit encrypts each Apple Pay token for that Merchant ID, so only the holder
of its Payment Processing Certificate's private key can decrypt it.

- **Web:** one Jupico Merchant ID + domain verification covers every merchant.
- **Native:** every merchant app has its own Merchant ID, so the VGS Apple Pay
  route needs **one certificate per merchant app**.

The usual processor flow, also used by Stripe and Adyen:

```
Jupico/VGS ── CSR ──▶ merchant ── uploads CSR to Apple ──▶ Apple
                                   (Merchant ID → Payment Processing Certificate)
merchant ── apple_pay.cer ──▶ Jupico ── installs on the VGS Apple Pay route
```

The private key never leaves Jupico/VGS. Until the certificate for a merchant's
Merchant ID is installed, live Apple Pay payments in that app fail at
`TOKENIZATION_FAILED`. Simulator sessions are not affected.

### Common iOS failures

| Symptom | Cause |
|---|---|
| Sheet never opens, `PAYMENT_FAILED` "Unable to present the Apple Pay sheet" | `merchantIdentifier` doesn't match the entitlement, or the provisioning profile predates the Apple Pay capability |
| Status "Apple Pay isn't available on this device" | No supported card in Wallet, or Apple Pay restricted on the device |
| `TOKENIZATION_FAILED` after Face ID | The certificate for this Merchant ID isn't installed on the VGS route |

---

## Android requirements

### What the merchant sets up

| Step | Notes |
|---|---|
| Permissions | **None to add.** `INTERNET` is already in every React Native app. The Google Pay `com.google.android.gms.wallet.api.enabled` meta-data merges automatically from the SDK's manifest. |
| Testing | Works immediately. Non-production sessions use Google Pay's `TEST` environment, which needs no registration and returns test tokens. |
| Production | Register and get the app approved in the **Google Pay & Wallet Console**: business profile, package name, **release** signing key, and screenshots of the checkout flow for Google's integration review. |

Not needed:
- **Key exchange.** Google Pay uses gateway tokenization through
  `verygoodsecurity`, so there is no certificate step like Apple's.
- **A custom button.** The SDK uses Google's official `PayButton`.

### Common Android failures

| Symptom | Cause |
|---|---|
| Status "Google Pay isn't available on this device" | Google Play services missing or outdated, or Google Pay not set up |
| Works in TEST, fails in production | App not yet approved in the Google Pay & Wallet Console, or signed with a different key than the one registered |
| `PAYMENT_FAILED` "Cardholder name is required…" | The user's Google Pay billing address has no name |

---

## Jupico-side setup per merchant

| Item | Why |
|---|---|
| Sub-merchant features `applePay` / `googlePay` enabled | Otherwise the session returns `auth_submerchant_feature_disabled` and the component shows "unavailable for this merchant" |
| API user with role `api-txs` for the merchant's **backend** | Needed to call `POST /v1/sessions/browser/authorize`. Never put it in the app. |
| Apple Pay certificate for the merchant's Merchant ID installed on VGS | See [Why each merchant needs its own certificate](#why-each-merchant-needs-its-own-certificate) |

If the merchant's app restricts network traffic (certificate pinning, corporate
proxies, MDM), it must allow:

- `*-payments-hosted-api.jupico.com` (session validation, simulator)
- `*.sandbox.verygoodproxy.com` and `*.live.verygoodproxy.com` (wallet tokenization)

---

## Checklists

### Merchant: iOS

- [ ] Merchant ID created in the app's own Apple Developer team
- [ ] CSR received from Jupico, Payment Processing Certificate created, `.cer` sent to Jupico
- [ ] Apple Pay capability enabled on the App ID with the Merchant ID
- [ ] Provisioning profile regenerated
- [ ] `merchantIdentifier` prop set to the same Merchant ID
- [ ] Tested with a simulator session, then with a real card on a device

### Merchant: Android

- [ ] Tested in `TEST` with a non-production session
- [ ] App registered in the Google Pay & Wallet Console with the release key
- [ ] Integration review approved before using production sessions

### Merchant: backend

- [ ] Endpoint that calls `/v1/sessions/browser/authorize` and returns `data.sessions` to the app
- [ ] Endpoint that receives the `oneTimeToken` and runs the sale
- [ ] Jupico API credentials stored server-side only

### Jupico

- [ ] Sub-merchant `applePay` / `googlePay` features enabled
- [ ] Merchant's Apple Pay certificate installed on the VGS Apple Pay route
- [ ] Google Pay merchant model confirmed (see below)

---

## Open decisions for Jupico

1. **Apple Pay certificate flow.** Define how merchants receive the CSR and
   return the `.cer`, and who installs it on the VGS Apple Pay route. Today the
   route is set up for the web's single Jupico Merchant ID, so native Apple Pay
   needs this before any merchant goes live.
2. **Google Pay merchant model.** The session's `merchantId` comes from Jupico's
   config (`TOKENIZATION_GOOGLE_PAY_MERCHANT_ID`). Confirm whether merchant apps
   are approved under **Jupico's** Google Pay merchant account (as a payment
   facilitator) or each merchant needs **its own** merchant ID. In the second
   case the SDK should accept a `merchantId` override, as it already does for Apple.
3. **Native attestation instead of origin + reCAPTCHA.** The backend can't yet
   tell a genuine merchant app from a script calling the same endpoints. Options:
   - **App Attest** (iOS) / **Play Integrity** (Android), verified server-side;
   - **reCAPTCHA Enterprise for mobile**, which fits the existing
     `reCaptchaToken` field (the SDK already has the `getReCaptchaToken` prop).

   Until then the SDK sends `reCaptchaToken: "react-native-sdk"`. This passes
   only because server-side verification is currently log-only.
