package com.jupico.wallets.core

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal

/**
 * The wallet entry of a Jupico `sessions` object, as returned by
 * `POST /v1/sessions/browser/authorize` and consumed by the web components.
 *
 * `sessions` arrives either as `{ data: "<base64 JSON>" }` (the raw authorize
 * response) or already decoded as `{ applePay: {...}, googlePay: {...} }`.
 * Both shapes are accepted, exactly like `google-pay-jupico` on the web.
 */
data class JupicoWalletSession(
    val providerType: String?,
    val providerSettings: Map<String, Any?>,
    val tokenSessionId: String?,
    val subMerchantPublicKey: String?,
    val environment: String?,
    val amount: String?,
    val description: String?,
    val countryCode: String,
    val currencyCode: String,
    /** Present when the backend refused this wallet (e.g. feature disabled). */
    val error: Map<String, Any?>?,
) {
    val isSimulator: Boolean get() = providerType == "simulator"

    companion object {
        /** @param wallet `"applePay"` or `"googlePay"`. */
        @Suppress("UNCHECKED_CAST")
        fun decode(sessions: Map<String, Any?>?, wallet: String): JupicoWalletSession? {
            if (sessions == null) return null
            val root = (sessions["data"] as? String)?.let { decodeBase64Json(it) ?: return null } ?: sessions
            val entry = root[wallet] as? Map<String, Any?> ?: return null
            val provider = entry["provider"] as? Map<String, Any?>
            return JupicoWalletSession(
                providerType = provider?.get("type") as? String,
                providerSettings = provider?.get("settings") as? Map<String, Any?> ?: emptyMap(),
                tokenSessionId = entry["tokenSessionId"] as? String,
                subMerchantPublicKey = entry["subMerchantPublicKey"] as? String,
                environment = entry["environment"] as? String,
                amount = stringValue(entry["amount"]),
                description = entry["description"] as? String,
                countryCode = entry["countryCode"] as? String ?: "US",
                currencyCode = entry["currencyCode"] as? String ?: "USD",
                error = entry["error"] as? Map<String, Any?>,
            )
        }

        /** URL-safe base64 → JSON object, mirroring web-components `decodeBase64`. */
        fun decodeBase64Json(s: String): Map<String, Any?>? = runCatching {
            val normalized = s.replace('-', '+').replace('_', '/')
            val json = String(Base64.decode(normalized, Base64.DEFAULT), Charsets.UTF_8)
            jsonToMap(JSONObject(json))
        }.getOrNull()

        fun stringValue(v: Any?): String? = when (v) {
            is String -> v
            is Number -> BigDecimal(v.toString()).stripTrailingZeros().toPlainString()
            else -> null
        }

        private fun jsonToMap(o: JSONObject): Map<String, Any?> =
            o.keys().asSequence().associateWith { jsonValue(o.get(it)) }

        private fun jsonValue(v: Any?): Any? = when (v) {
            is JSONObject -> jsonToMap(v)
            is JSONArray -> (0 until v.length()).map { jsonValue(v.get(it)) }
            JSONObject.NULL -> null
            else -> v
        }
    }
}

/** What the component is showing. Emitted through statusChange and rendered inside it. */
enum class JupicoWalletStatus(val value: String) {
    READY("ready"),
    UNAVAILABLE("unavailable"),
    DISABLED("disabled"),
    PROCESSING("processing"),
    SUCCESS("success"),
    FAILED("failed"),
    CANCELLED("cancelled"),
}
