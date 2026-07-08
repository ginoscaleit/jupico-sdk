package com.jupico.wallets.core

import android.app.Activity
import com.google.android.gms.tasks.Task
import com.google.android.gms.wallet.IsReadyToPayRequest
import com.google.android.gms.wallet.PaymentData
import com.google.android.gms.wallet.PaymentDataRequest
import com.google.android.gms.wallet.PaymentsClient
import com.google.android.gms.wallet.Wallet
import com.google.android.gms.wallet.WalletConstants
import org.json.JSONArray
import org.json.JSONObject

/**
 * Layer 1 — the RN-agnostic Google Pay core.
 *
 * This file has ZERO React Native dependencies. A standalone Kotlin/Java app can
 * depend on the `:core` Gradle module directly. The RN bridge in the parent
 * package is a thin wrapper that converts ReadableMap <-> Map and forwards the
 * Activity result here.
 *
 * Google Pay's loadPaymentData is Activity-result based, so this core exposes
 * request builders + a Task, and lets the caller (bridge or native app) own the
 * Activity lifecycle. `LOAD_PAYMENT_DATA_REQUEST_CODE` is the request code to
 * watch for in onActivityResult.
 */
class GooglePayCore(private val config: Map<String, Any?>) {

    companion object {
        const val LOAD_PAYMENT_DATA_REQUEST_CODE = 0xC0FE

        /** Stable error codes shared with the JS WalletErrorCode model. */
        const val CANCELLED = "CANCELLED"
        const val UNSUPPORTED_DEVICE = "UNSUPPORTED_DEVICE"
        const val NO_ELIGIBLE_CARDS = "NO_ELIGIBLE_CARDS"
        const val INVALID_CONFIGURATION = "INVALID_CONFIGURATION"
        const val PAYMENT_FAILED = "PAYMENT_FAILED"

        private val NETWORK_MAP = mapOf(
            "visa" to "VISA",
            "mastercard" to "MASTERCARD",
            "amex" to "AMEX",
            "discover" to "DISCOVER",
            "jcb" to "JCB",
            "interac" to "INTERAC",
            "maestro" to "MAESTRO",
        )
    }

    @Suppress("UNCHECKED_CAST")
    private val google: Map<String, Any?> =
        (config["google"] as? Map<String, Any?>) ?: emptyMap()

    private val environmentConstant: Int
        get() = if ((google["environment"] as? String) == "PRODUCTION") {
            WalletConstants.ENVIRONMENT_PRODUCTION
        } else {
            WalletConstants.ENVIRONMENT_TEST
        }

    /** Creates the PaymentsClient bound to the given Activity. */
    fun createPaymentsClient(activity: Activity): PaymentsClient {
        val options = Wallet.WalletOptions.Builder()
            .setEnvironment(environmentConstant)
            .build()
        return Wallet.getPaymentsClient(activity, options)
    }

    // MARK: - Request JSON

    private fun baseRequest(): JSONObject {
        val apiVersion = google["apiVersion"] as? Map<*, *>
        return JSONObject()
            .put("apiVersion", (apiVersion?.get("major") as? Number)?.toInt() ?: 2)
            .put("apiVersionMinor", (apiVersion?.get("minor") as? Number)?.toInt() ?: 0)
    }

    private fun allowedNetworks(): JSONArray {
        val networks = (config["supportedNetworks"] as? List<*>) ?: emptyList<Any?>()
        val mapped = networks
            .mapNotNull { NETWORK_MAP[(it as? String)?.lowercase()] }
        require(mapped.isNotEmpty()) { "supportedNetworks must not be empty." }
        return JSONArray(mapped)
    }

    private fun cardPaymentMethod(): JSONObject {
        val tokenization = tokenizationSpecification()
        val billingRequired = google["billingAddressRequired"] as? Boolean ?: false
        val parameters = JSONObject()
            .put("allowedAuthMethods", JSONArray(listOf("PAN_ONLY", "CRYPTOGRAM_3DS")))
            .put("allowedCardNetworks", allowedNetworks())
            .put("billingAddressRequired", billingRequired)
        return JSONObject()
            .put("type", "CARD")
            .put("parameters", parameters)
            .put("tokenizationSpecification", tokenization)
    }

    /** Maps our shared TokenizationSpec to Google's tokenizationSpecification. */
    private fun tokenizationSpecification(): JSONObject {
        @Suppress("UNCHECKED_CAST")
        val spec = (config["tokenization"] as? Map<String, Any?>)
            ?: throw IllegalArgumentException("tokenization is required.")
        return when (spec["type"] as? String) {
            "gateway" -> {
                val gateway = spec["gateway"] as? String
                    ?: throw IllegalArgumentException("tokenization.gateway is required.")
                @Suppress("UNCHECKED_CAST")
                val params = (spec["parameters"] as? Map<String, Any?>) ?: emptyMap()
                val paramJson = JSONObject().put("gateway", gateway)
                params.forEach { (k, v) -> paramJson.put(k, v?.toString()) }
                JSONObject()
                    .put("type", "PAYMENT_GATEWAY")
                    .put("parameters", paramJson)
            }
            "direct" -> {
                JSONObject()
                    .put("type", "DIRECT")
                    .put(
                        "parameters",
                        JSONObject()
                            .put("protocolVersion", spec["protocolVersion"] as? String)
                            .put("publicKey", spec["publicKey"] as? String)
                    )
            }
            else -> throw IllegalArgumentException("tokenization.type must be 'gateway' or 'direct'.")
        }
    }

    private fun merchantInfo(): JSONObject {
        val name = google["merchantName"] as? String
            ?: throw IllegalArgumentException("google.merchantName is required.")
        val info = JSONObject().put("merchantName", name)
        (google["merchantId"] as? String)?.let { info.put("merchantId", it) }
        return info
    }

    private fun transactionInfo(): JSONObject {
        val currency = config["currencyCode"] as? String
            ?: throw IllegalArgumentException("currencyCode is required.")
        val total = config["totalAmount"] as? String
            ?: throw IllegalArgumentException("totalAmount is required.")
        return JSONObject()
            .put("totalPrice", total)
            .put("totalPriceStatus", "FINAL")
            .put("currencyCode", currency)
    }

    /** IsReadyToPay request JSON. */
    fun isReadyToPayRequest(): IsReadyToPayRequest {
        val json = baseRequest()
            .put("allowedPaymentMethods", JSONArray().put(cardPaymentMethod()))
        return IsReadyToPayRequest.fromJson(json.toString())
    }

    /** Full PaymentDataRequest JSON for loadPaymentData. */
    fun paymentDataRequest(): PaymentDataRequest {
        val json = baseRequest()
            .put("allowedPaymentMethods", JSONArray().put(cardPaymentMethod()))
            .put("merchantInfo", merchantInfo())
            .put("transactionInfo", transactionInfo())
        return PaymentDataRequest.fromJson(json.toString())
    }

    /** Convenience: kick off loadPaymentData and return the Task. */
    fun loadPaymentData(activity: Activity): Task<PaymentData> {
        return createPaymentsClient(activity).loadPaymentData(paymentDataRequest())
    }

    /** Parse a successful PaymentData into our shared PaymentResult shape. */
    fun parseResult(paymentData: PaymentData): Map<String, Any?> {
        val json = JSONObject(paymentData.toJson())
        val paymentMethodData = json.optJSONObject("paymentMethodData")
        val token = paymentMethodData
            ?.optJSONObject("tokenizationData")
            ?.optString("token")
        val info = paymentMethodData?.optJSONObject("info")
        return buildMap {
            put("platform", "google-pay")
            put("token", token ?: "")
            info?.optString("cardNetwork")?.let { if (it.isNotEmpty()) put("cardNetwork", it) }
            paymentMethodData?.optString("description")?.let {
                if (it.isNotEmpty()) put("cardDetails", it)
            }
        }
    }
}
