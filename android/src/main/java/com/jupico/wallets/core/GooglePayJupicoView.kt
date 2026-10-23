package com.jupico.wallets.core

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Color
import android.util.Base64
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import com.google.android.gms.wallet.AutoResolveHelper
import com.google.android.gms.wallet.PaymentData
import com.google.android.gms.wallet.button.ButtonConstants
import com.google.android.gms.wallet.button.ButtonOptions
import com.google.android.gms.wallet.button.PayButton
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.text.NumberFormat
import java.util.Currency

/**
 * Layer 1 UI — the native equivalent of the `<google-pay-jupico>` web component.
 *
 * This view is the source of truth for the Google Pay UI on Android. It has ZERO
 * React Native dependencies: Kotlin/Java apps use it directly, and the RN
 * `<GooglePayJupico>` tag is a thin wrapper around it.
 *
 * Contract (same as the web component):
 * - [sessions]: the authorize-session object (`{ data: base64 }` or decoded).
 * - [transactionComplete]: success handler, receives `{ oneTimeToken: { paymentToken: { data } } }`.
 * - [submitError]: failure handler, receives `{ error: { code, message } }`.
 * - [statusChange]: fired for every scenario; the same status is rendered
 *   inside the component under the button.
 *
 * Google Pay returns its result through `onActivityResult`, so the host
 * Activity must forward it: `GooglePayJupicoView.dispatchActivityResult(...)`.
 * The RN bridge does this automatically.
 */
open class GooglePayJupicoView(context: Context) : LinearLayout(context) {

    // MARK: Inputs

    var sessions: Map<String, Any?>? = null
        set(value) { field = value; scheduleReload() }
    /** Overrides the session amount, like the web component's `amount` attribute. */
    var amount: String? = null
        set(value) { field = value; scheduleReload() }
    var disabled: Boolean = false
        set(value) { field = value; scheduleReload() }
    /** `"dark"` (default) or `"light"`. */
    var buttonTheme: String = "dark"
        set(value) { field = value; scheduleReload() }
    /** Where the Google Pay sheet is launched from. Override when the context is not an Activity. */
    var activityProvider: () -> Activity? = { findActivity(context) }

    // MARK: Outputs

    var transactionComplete: ((Map<String, Any?>) -> Unit)? = null
    var submitError: ((Map<String, Any?>) -> Unit)? = null
    var statusChange: ((Map<String, Any?>) -> Unit)? = null

    var status: JupicoWalletStatus = JupicoWalletStatus.UNAVAILABLE
        private set
    var statusMessage: String? = null
        private set

    // MARK: Subviews / state

    private val buttonContainer = FrameLayout(context)
    private val spinner = ProgressBar(context)
    private val statusLabel = TextView(context)
    private var payButton: PayButton? = null
    private var session: JupicoWalletSession? = null
    private var core: GooglePayCore? = null
    private var reloadScheduled = false

    init {
        orientation = VERTICAL
        addView(buttonContainer, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
        spinner.isIndeterminate = true
        spinner.visibility = GONE
        statusLabel.gravity = Gravity.CENTER
        statusLabel.textSize = 13f
        statusLabel.maxLines = 1
        addView(statusLabel, LayoutParams(LayoutParams.MATCH_PARENT, dp(24)))
        scheduleReload()
    }

    // MARK: Session → status

    /**
     * Inputs can be set in any order (RN sets props one by one), so collapse
     * them into a single reload on the next frame. This also guarantees the
     * handlers are attached before the first statusChange fires.
     */
    private fun scheduleReload() {
        if (reloadScheduled) return
        reloadScheduled = true
        post {
            reloadScheduled = false
            reload()
        }
    }

    private fun reload() {
        if (status == JupicoWalletStatus.PROCESSING) return
        val sessions = sessions
        if (sessions == null) {
            clearSession()
            setStatus(JupicoWalletStatus.UNAVAILABLE, "Waiting for session")
            return
        }
        val decoded = JupicoWalletSession.decode(sessions, "googlePay")
        if (decoded == null) {
            clearSession()
            setStatus(JupicoWalletStatus.UNAVAILABLE, "No Google Pay session")
            emitError("INVALID_SESSION", "sessions has no googlePay entry.")
            return
        }
        decoded.error?.let { err ->
            clearSession()
            setStatus(JupicoWalletStatus.UNAVAILABLE, "Google Pay unavailable for this merchant")
            emitError("INVALID_SESSION", err["message"] as? String ?: "Session error.", err)
            return
        }
        if (decoded.providerType != "vgs-googlepay" && !decoded.isSimulator) {
            clearSession()
            setStatus(JupicoWalletStatus.UNAVAILABLE, "Unsupported provider")
            emitError("INVALID_SESSION", "Unsupported Google Pay provider: ${decoded.providerType ?: "none"}.")
            return
        }

        val walletCore = GooglePayCore(coreConfig(decoded))
        try {
            installButton(walletCore)
        } catch (e: Exception) {
            clearSession()
            setStatus(JupicoWalletStatus.FAILED, "✕ ${e.message}")
            emitError("INVALID_CONFIGURATION", e.message ?: "Invalid Google Pay configuration.")
            return
        }
        session = decoded
        core = walletCore

        if (decoded.isSimulator) {
            setStatus(if (disabled) JupicoWalletStatus.DISABLED else JupicoWalletStatus.READY, null)
            return
        }
        val activity = activityProvider()
        if (activity == null) {
            setStatus(JupicoWalletStatus.UNAVAILABLE, "No Activity to host Google Pay")
            return
        }
        walletCore.createPaymentsClient(activity)
            .isReadyToPay(walletCore.isReadyToPayRequest())
            .addOnCompleteListener { task ->
                val ready = runCatching { task.getResult(Exception::class.java) }.getOrDefault(false) == true
                when {
                    !ready -> setStatus(JupicoWalletStatus.UNAVAILABLE, "Google Pay isn't available on this device")
                    disabled -> setStatus(JupicoWalletStatus.DISABLED, null)
                    else -> setStatus(JupicoWalletStatus.READY, null)
                }
            }
    }

    /** Same request the web component builds (VGS gateway, networks, billing address). */
    private fun coreConfig(s: JupicoWalletSession): Map<String, Any?> = mapOf(
        "currencyCode" to s.currencyCode,
        "totalAmount" to (amount ?: s.amount ?: "0.00"),
        "supportedNetworks" to listOf("amex", "visa", "mastercard", "discover"),
        "tokenization" to mapOf(
            "type" to "gateway",
            "gateway" to GATEWAY,
            "parameters" to mapOf("gatewayMerchantId" to GATEWAY_MERCHANT_ID),
        ),
        "google" to mapOf(
            "merchantName" to (s.providerSettings["merchantName"] as? String ?: "Jupico"),
            "merchantId" to (s.providerSettings["merchantId"] as? String),
            "environment" to if (s.environment == "production") "PRODUCTION" else "TEST",
            "billingAddressRequired" to true,
        ),
    )

    private fun installButton(walletCore: GooglePayCore) {
        payButton?.let { buttonContainer.removeView(it) }
        buttonContainer.removeView(spinner)
        val button = PayButton(context)
        button.initialize(
            ButtonOptions.newBuilder()
                .setButtonType(ButtonConstants.ButtonType.PAY)
                .setButtonTheme(
                    if (buttonTheme == "light") ButtonConstants.ButtonTheme.LIGHT
                    else ButtonConstants.ButtonTheme.DARK
                )
                .setAllowedPaymentMethods(walletCore.allowedPaymentMethodsJson())
                .build()
        )
        button.setOnClickListener { handleTap() }
        buttonContainer.addView(button, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        buttonContainer.addView(spinner, FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER))
        payButton = button
    }

    private fun clearSession() {
        session = null
        core = null
    }

    // MARK: Payment

    private fun handleTap() {
        val session = session ?: return
        val walletCore = core ?: return
        if (status !in INTERACTIVE) return
        setStatus(JupicoWalletStatus.PROCESSING, "Processing…")
        if (session.isSimulator) {
            presentSimulator(session)
            return
        }
        val activity = activityProvider()
        if (activity == null) {
            fail("PAYMENT_FAILED", "No Activity to host Google Pay.")
            return
        }
        try {
            pending = WeakReference(this)
            AutoResolveHelper.resolveTask(walletCore.loadPaymentData(activity), activity, REQUEST_CODE)
        } catch (e: IllegalArgumentException) {
            pending = null
            fail("INVALID_CONFIGURATION", e.message ?: "Invalid Google Pay configuration.")
        } catch (e: Exception) {
            pending = null
            fail("PAYMENT_FAILED", e.message ?: "Unable to open Google Pay.")
        }
    }

    /** Handles the Google Pay result for this view. Returns false if it was not ours. */
    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        when (resultCode) {
            Activity.RESULT_OK -> {
                val paymentData = data?.let { PaymentData.getFromIntent(it) }
                if (paymentData == null) {
                    fail("PAYMENT_FAILED", "No payment data returned.")
                } else {
                    val result = GooglePayCore(emptyMap()).parseResult(paymentData)
                    complete(
                        token = result["token"] as? String ?: "",
                        cardNetwork = result["cardNetwork"] as? String,
                        cardDetails = result["cardDetails"] as? String,
                        simulated = false,
                    )
                }
            }
            Activity.RESULT_CANCELED -> fail("CANCELLED", "The user cancelled the payment.")
            AutoResolveHelper.RESULT_ERROR -> {
                val st = AutoResolveHelper.getStatusFromIntent(data)
                fail("PAYMENT_FAILED", "Google Pay error: ${st?.statusMessage ?: st?.statusCode}")
            }
            else -> fail("PAYMENT_FAILED", "Unknown result: $resultCode")
        }
        return true
    }

    /**
     * `provider.type == "simulator"`: a stand-in sheet so the flow can be demoed
     * without a card (the web component has the same mode).
     */
    private fun presentSimulator(session: JupicoWalletSession) {
        val activity = activityProvider()
        if (activity == null) {
            fail("PAYMENT_FAILED", "No Activity to host the simulator.")
            return
        }
        var handled = false
        AlertDialog.Builder(activity)
            .setTitle("Google Pay · Simulator")
            .setMessage("${session.description ?: "Payment"}\n${formattedAmount(session)}\n\nTest card: Visa ••1111")
            .setPositiveButton("Pay") { _, _ ->
                handled = true
                val fake = JSONObject()
                    .put("simulator", true)
                    .put("tokenSessionId", session.tokenSessionId ?: "")
                    .put("card", "visa-1111")
                    .put("createdAt", System.currentTimeMillis())
                complete(
                    token = Base64.encodeToString(fake.toString().toByteArray(), Base64.NO_WRAP),
                    cardNetwork = "VISA",
                    cardDetails = "Visa 1111",
                    simulated = true,
                )
            }
            .setNegativeButton("Decline") { _, _ ->
                handled = true
                fail("PAYMENT_FAILED", "Card declined (simulated).")
            }
            .setNeutralButton("Cancel") { _, _ ->
                handled = true
                fail("CANCELLED", "The user cancelled the payment.")
            }
            .setOnDismissListener {
                if (!handled) fail("CANCELLED", "The user cancelled the payment.")
            }
            .show()
    }

    private fun complete(token: String, cardNetwork: String?, cardDetails: String?, simulated: Boolean) {
        setStatus(JupicoWalletStatus.SUCCESS, "✓ Payment authorized")
        // Same shape the web component passes to transactionComplete. In this
        // proof of concept `data` is the wallet token; once the VGS one-time
        // token call is wired in it becomes the Jupico OTT.
        transactionComplete?.invoke(mapOf(
            "oneTimeToken" to mapOf("paymentToken" to mapOf("data" to token)),
            "wallet" to mapOf(
                "platform" to "google-pay",
                "simulated" to simulated,
                "cardNetwork" to cardNetwork,
                "cardDetails" to cardDetails,
                "tokenSessionId" to session?.tokenSessionId,
            ).filterValues { it != null },
        ))
    }

    private fun fail(code: String, message: String) {
        if (code == "CANCELLED") {
            setStatus(JupicoWalletStatus.CANCELLED, "Payment cancelled")
        } else {
            setStatus(JupicoWalletStatus.FAILED, "✕ $message")
        }
        emitError(code, message)
    }

    // MARK: Helpers

    private fun emitError(code: String, message: String, details: Map<String, Any?>? = null) {
        val error = (details ?: emptyMap()) + mapOf("code" to code, "message" to message)
        submitError?.invoke(mapOf("error" to error))
    }

    private fun setStatus(s: JupicoWalletStatus, message: String?) {
        status = s
        statusMessage = message
        render()
        statusChange?.invoke(mapOf("status" to s.value, "message" to message).filterValues { it != null })
    }

    private fun render() {
        val button = payButton
        button?.isEnabled = status in INTERACTIVE
        button?.alpha = if (status == JupicoWalletStatus.READY || status in RESULT_STATES) 1f else 0.4f
        buttonContainer.visibility = if (button == null) INVISIBLE else VISIBLE
        spinner.visibility = if (status == JupicoWalletStatus.PROCESSING) VISIBLE else GONE
        statusLabel.text = statusMessage ?: ""
        statusLabel.setTextColor(
            when (status) {
                JupicoWalletStatus.SUCCESS -> Color.rgb(0x2E, 0xB8, 0x5C)
                JupicoWalletStatus.FAILED -> Color.rgb(0xE5, 0x48, 0x4D)
                else -> Color.rgb(0x8A, 0x8A, 0x99)
            }
        )
    }

    private fun formattedAmount(s: JupicoWalletSession): String = runCatching {
        val f = NumberFormat.getCurrencyInstance()
        f.currency = Currency.getInstance(s.currencyCode)
        f.format((amount ?: s.amount ?: "0").toBigDecimal())
    }.getOrDefault("${amount ?: s.amount} ${s.currencyCode}")

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val REQUEST_CODE = 0xC0FF

        // Hard-coded in web-components src/data/enums.ts; the session doesn't carry them.
        const val GATEWAY = "verygoodsecurity"
        const val GATEWAY_MERCHANT_ID = "ACgtnCohNkFmTpkULj2jaRvX"

        private val RESULT_STATES = setOf(
            JupicoWalletStatus.SUCCESS, JupicoWalletStatus.FAILED, JupicoWalletStatus.CANCELLED)
        private val INTERACTIVE = RESULT_STATES + JupicoWalletStatus.READY

        private var pending: WeakReference<GooglePayJupicoView>? = null

        /**
         * Call from your Activity's `onActivityResult`. Routes the Google Pay
         * result to the view that launched it; returns true if it was handled.
         */
        @JvmStatic
        fun dispatchActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
            if (requestCode != REQUEST_CODE) return false
            val view = pending?.get() ?: return false
            pending = null
            return view.handleActivityResult(requestCode, resultCode, data)
        }

        private fun findActivity(context: Context): Activity? {
            var c: Context? = context
            while (c is ContextWrapper) {
                if (c is Activity) return c
                c = c.baseContext
            }
            return null
        }
    }
}
