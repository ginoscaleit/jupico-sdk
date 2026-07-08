# Build roadmap

Maps to the phased plan. ✅ = scaffolded in this repo, ⬜ = still to do.

## Phase 0 — Accounts & decisions (do before shipping)
- ⬜ Choose PSP/gateway (gates both certificates and tokenization spec).
- ⬜ Apple: Merchant ID + Apple Pay Payment Processing Certificate + capability.
- ⬜ Google: Wallet Console profile; note PRODUCTION requires Google's review.
- ✅ Confirmed target: New Architecture / Turbo Modules.

## Phase 1 — Scaffold
- ✅ Library layout, TS config, podspec, gradle, codegen spec.
- ⬜ Add an `example/` app (via `create-react-native-library`) + CI building both platforms.

## Phase 2 — iOS core (RN-agnostic)  ✅
- ✅ `ApplePayCore.swift`: availability, PKPaymentRequest builder, controller +
  delegate, token extraction. Packaged as `JupicoWalletsCore` pod.
- ⬜ Prove in a standalone Swift sample app.

## Phase 3 — Android core (RN-agnostic)  ✅
- ✅ `GooglePayCore.kt`: IsReadyToPay, PaymentDataRequest w/ tokenization spec,
  loadPaymentData, result parsing.
- ⬜ Publish as AAR (JitPack) + prove in a standalone Kotlin sample app.

## Phase 4 — RN bridge  ✅
- ✅ iOS `RCT_EXTERN_MODULE` bridge + Android module/package.
- ⬜ Optional: event emitter for dynamic shipping / cancel callbacks.

## Phase 5 — TS facade  ✅
- ✅ `isSupported` / `canMakePayments` / `requestPayment`, unified error model.

## Phase 6 — Token handling / PSP
- ⬜ Backend endpoint that forwards the token to the PSP; test against sandbox.

## Phase 7 — Testing & hardening
- ⬜ Real-device Apple Pay tests; Google TEST → PRODUCTION approval.
- ⬜ Edge cases: cancel, no cards, unsupported hardware, mid-flow network failure.

## Phase 8 — Distribution
- ⬜ Publish npm + CocoaPod + Maven artifacts in lockstep versioning.
- ✅ RN and native-only integration guides (`docs/`).
