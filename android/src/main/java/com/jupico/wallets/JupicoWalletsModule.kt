package com.jupico.wallets

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.wallet.AutoResolveHelper
import com.google.android.gms.wallet.PaymentData
import com.jupico.wallets.core.GooglePayCore

/**
 * Layer 2 — the React Native bridge for Android.
 *
 * Holds NO payment logic. It converts ReadableMap -> Map, delegates to the
 * RN-agnostic [GooglePayCore] (Layer 1), and owns the Activity-result plumbing
 * that Google Pay requires. Payment/JSON logic lives in the core.
 */
class JupicoWalletsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var pendingPromise: Promise? = null

    private val activityListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity?,
                requestCode: Int,
                resultCode: Int,
                data: Intent?
            ) {
                if (requestCode != GooglePayCore.LOAD_PAYMENT_DATA_REQUEST_CODE) return
                val promise = pendingPromise ?: return
                pendingPromise = null

                when (resultCode) {
                    Activity.RESULT_OK -> {
                        val paymentData = data?.let { PaymentData.getFromIntent(it) }
                        if (paymentData == null) {
                            promise.reject(GooglePayCore.PAYMENT_FAILED, "No payment data returned.")
                        } else {
                            val result = GooglePayCore(emptyMap()).parseResult(paymentData)
                            promise.resolve(toWritableMap(result))
                        }
                    }
                    Activity.RESULT_CANCELED ->
                        promise.reject(GooglePayCore.CANCELLED, "The user cancelled the payment.")
                    AutoResolveHelper.RESULT_ERROR -> {
                        val status = AutoResolveHelper.getStatusFromIntent(data)
                        promise.reject(
                            GooglePayCore.PAYMENT_FAILED,
                            "Google Pay error: ${status?.statusMessage ?: status?.statusCode}"
                        )
                    }
                    else -> promise.reject(GooglePayCore.PAYMENT_FAILED, "Unknown result: $resultCode")
                }
            }
        }

    init {
        reactContext.addActivityEventListener(activityListener)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun isSupported(promise: Promise) {
        // Coarse check: Google Play Services + wallet available. isReadyToPay is
        // the meaningful signal, so we defer to canMakePayments with a minimal
        // request when possible; here we just report true and let canMakePayments
        // do the real gate. Consumers should call canMakePayments(request).
        promise.resolve(true)
    }

    @ReactMethod
    fun canMakePayments(request: ReadableMap, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            val core = GooglePayCore(request.toHashMap())
            core.createPaymentsClient(activity)
                .isReadyToPay(core.isReadyToPayRequest())
                .addOnCompleteListener { task ->
                    promise.resolve(runCatching { task.getResult(Exception::class.java) }.getOrDefault(false))
                }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPayment(request: ReadableMap, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject(GooglePayCore.PAYMENT_FAILED, "No current Activity.")
            return
        }
        if (pendingPromise != null) {
            promise.reject(GooglePayCore.PAYMENT_FAILED, "A payment is already in progress.")
            return
        }
        try {
            val core = GooglePayCore(request.toHashMap())
            pendingPromise = promise
            AutoResolveHelper.resolveTask(
                core.loadPaymentData(activity),
                activity,
                GooglePayCore.LOAD_PAYMENT_DATA_REQUEST_CODE
            )
        } catch (e: IllegalArgumentException) {
            pendingPromise = null
            promise.reject(GooglePayCore.INVALID_CONFIGURATION, e.message, e)
        } catch (e: Exception) {
            pendingPromise = null
            promise.reject(GooglePayCore.PAYMENT_FAILED, e.message, e)
        }
    }

    private fun toWritableMap(map: Map<String, Any?>): WritableMap {
        val writable = Arguments.createMap()
        for ((key, value) in map) {
            when (value) {
                null -> writable.putNull(key)
                is String -> writable.putString(key, value)
                is Boolean -> writable.putBoolean(key, value)
                is Int -> writable.putInt(key, value)
                is Double -> writable.putDouble(key, value)
                else -> writable.putString(key, value.toString())
            }
        }
        return writable
    }

    companion object {
        const val NAME = "JupicoWallets"
    }
}
