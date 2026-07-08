# Using the Google Pay core in a native-only Android app

The core in `android/.../core/GooglePayCore.kt` has **no React Native
dependency**. It depends only on `com.google.android.gms:play-services-wallet`.

## 1. Prerequisites (Phase 0)

- A Google Pay & Wallet Console business profile.
- A chosen **gateway/PSP** (the tokenization spec depends on it).
- Google reviews your integration before granting **PRODUCTION** access. In
  `TEST` you only get dummy tokens — plan for the approval step.
- Add to your app's `AndroidManifest.xml`:

```xml
<meta-data
  android:name="com.google.android.gms.wallet.api.enabled"
  android:value="true" />
```

## 2. Depend on the core

Copy the `core` package into your project, or publish it as an AAR (JitPack works
for early stages), then:

```gradle
dependencies {
  implementation "com.google.android.gms:play-services-wallet:19.4.0"
  implementation "com.jupico:wallets-core:0.1.0" // once published
}
```

## 3. Call it

```kotlin
val config = mapOf(
  "currencyCode" to "USD",
  "totalAmount" to "4.50",
  "supportedNetworks" to listOf("visa", "mastercard", "amex"),
  "tokenization" to mapOf(
    "type" to "gateway",
    "gateway" to "stripe",
    "parameters" to mapOf("stripe:version" to "2024-06-20", "stripe:publishableKey" to "pk_live_...")
  ),
  "google" to mapOf("merchantName" to "Jupico", "environment" to "TEST")
)

val core = GooglePayCore(config)

// Gate the button:
core.createPaymentsClient(activity)
  .isReadyToPay(core.isReadyToPayRequest())
  .addOnCompleteListener { task -> val ready = task.isSuccessful && task.result == true }

// Launch the sheet:
AutoResolveHelper.resolveTask(
  core.loadPaymentData(activity),
  activity,
  GooglePayCore.LOAD_PAYMENT_DATA_REQUEST_CODE
)

// In your Activity.onActivityResult:
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
  if (requestCode == GooglePayCore.LOAD_PAYMENT_DATA_REQUEST_CODE && resultCode == RESULT_OK) {
    val paymentData = PaymentData.getFromIntent(data!!)!!
    val result = core.parseResult(paymentData)
    val token = result["token"] as String  // forward to backend → PSP
  }
}
```

The RN bridge (`JupicoWalletsModule.kt`) does exactly this — it just owns the
Activity-result plumbing for you. Native apps own their own Activity, so they
call the core directly.
