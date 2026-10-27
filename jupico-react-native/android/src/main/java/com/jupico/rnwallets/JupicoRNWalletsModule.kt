package com.jupico.rnwallets

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.wallet.AutoResolveHelper
import com.google.android.gms.wallet.IsReadyToPayRequest
import com.google.android.gms.wallet.PaymentData
import com.google.android.gms.wallet.PaymentDataRequest
import com.google.android.gms.wallet.PaymentsClient
import com.google.android.gms.wallet.Wallet
import com.google.android.gms.wallet.WalletConstants
import org.json.JSONObject

/**
 * Opens the Google Pay sheet for `<GooglePayJupico>`.
 *
 * The request JSON is built in JS (same as the web component's paymentRequest),
 * so this module only checks readiness, launches the sheet and returns the
 * PaymentData JSON. Google Pay answers through onActivityResult.
 */
class JupicoRNWalletsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var pending: Promise? = null

    init {
        reactContext.addActivityEventListener(object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
                if (requestCode != REQUEST_CODE) return
                val promise = pending ?: return
                pending = null
                when (resultCode) {
                    Activity.RESULT_OK -> {
                        val paymentData = data?.let { PaymentData.getFromIntent(it) }
                        if (paymentData == null) promise.reject("PAYMENT_FAILED", "No payment data returned.")
                        else promise.resolve(paymentData.toJson())
                    }
                    Activity.RESULT_CANCELED -> promise.reject("CANCELLED", "The user cancelled the payment.")
                    AutoResolveHelper.RESULT_ERROR -> {
                        val status = AutoResolveHelper.getStatusFromIntent(data)
                        promise.reject(
                            "PAYMENT_FAILED",
                            "Google Pay error: ${status?.statusMessage ?: status?.statusCode}",
                        )
                    }
                    else -> promise.reject("PAYMENT_FAILED", "Unknown Google Pay result: $resultCode")
                }
            }
        })
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun isGooglePayReady(requestJson: String, environment: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            // IsReadyToPay takes only the base fields + allowedPaymentMethods.
            val full = JSONObject(requestJson)
            val readyJson = JSONObject()
                .put("apiVersion", full.getInt("apiVersion"))
                .put("apiVersionMinor", full.getInt("apiVersionMinor"))
                .put("allowedPaymentMethods", full.getJSONArray("allowedPaymentMethods"))
            client(activity, environment)
                .isReadyToPay(IsReadyToPayRequest.fromJson(readyJson.toString()))
                .addOnCompleteListener { task ->
                    promise.resolve(runCatching { task.getResult(Exception::class.java) }.getOrDefault(false) == true)
                }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun loadGooglePayPaymentData(requestJson: String, environment: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("PAYMENT_FAILED", "No current Activity to host Google Pay.")
            return
        }
        if (pending != null) {
            promise.reject("PAYMENT_FAILED", "A Google Pay payment is already in progress.")
            return
        }
        try {
            val request = PaymentDataRequest.fromJson(requestJson)
            pending = promise
            @Suppress("DEPRECATION")
            AutoResolveHelper.resolveTask(client(activity, environment).loadPaymentData(request), activity, REQUEST_CODE)
        } catch (e: Exception) {
            pending = null
            promise.reject("INVALID_CONFIGURATION", e.message ?: "Invalid Google Pay request.", e)
        }
    }

    private fun client(activity: Activity, environment: String): PaymentsClient {
        val env = if (environment == "PRODUCTION") WalletConstants.ENVIRONMENT_PRODUCTION
        else WalletConstants.ENVIRONMENT_TEST
        return Wallet.getPaymentsClient(activity, Wallet.WalletOptions.Builder().setEnvironment(env).build())
    }

    companion object {
        const val NAME = "JupicoRNWallets"
        private const val REQUEST_CODE = 0xC0F1
    }
}
