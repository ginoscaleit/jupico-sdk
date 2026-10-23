package com.jupico.wallets

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.jupico.wallets.core.GooglePayJupicoView

/**
 * Layer 2 UI bridge — exposes [GooglePayJupicoView] (Layer 1) to React Native as
 * `<GooglePayJupico>`. Holds NO payment or UI logic: it maps RN props onto the
 * view's inputs, its handlers onto RN events, and forwards the Activity result.
 */
class GooglePayJupicoViewManager(reactContext: ReactApplicationContext) :
    SimpleViewManager<RNGooglePayJupicoView>() {

    init {
        reactContext.addActivityEventListener(object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
                GooglePayJupicoView.dispatchActivityResult(requestCode, resultCode, data)
            }
        })
    }

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext) = RNGooglePayJupicoView(context)

    @ReactProp(name = "sessions")
    fun setSessions(view: RNGooglePayJupicoView, sessions: ReadableMap?) {
        view.sessions = sessions?.toHashMap()
    }

    @ReactProp(name = "amount")
    fun setAmount(view: RNGooglePayJupicoView, amount: String?) {
        view.amount = amount
    }

    @ReactProp(name = "disabled", defaultBoolean = false)
    fun setDisabled(view: RNGooglePayJupicoView, disabled: Boolean) {
        view.disabled = disabled
    }

    @ReactProp(name = "buttonTheme")
    fun setButtonTheme(view: RNGooglePayJupicoView, theme: String?) {
        view.buttonTheme = theme ?: "dark"
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
        EVENT_COMPLETE to mapOf("registrationName" to "onTransactionComplete"),
        EVENT_ERROR to mapOf("registrationName" to "onSubmitError"),
        EVENT_STATUS to mapOf("registrationName" to "onStatusChange"),
    )

    companion object {
        const val NAME = "GooglePayJupicoView"
        const val EVENT_COMPLETE = "topTransactionComplete"
        const val EVENT_ERROR = "topSubmitError"
        const val EVENT_STATUS = "topStatusChange"
    }
}

class RNGooglePayJupicoView(private val reactContext: ThemedReactContext) :
    GooglePayJupicoView(reactContext) {

    init {
        activityProvider = { reactContext.currentActivity }
        transactionComplete = { emit(GooglePayJupicoViewManager.EVENT_COMPLETE, it) }
        submitError = { emit(GooglePayJupicoViewManager.EVENT_ERROR, it) }
        statusChange = { emit(GooglePayJupicoViewManager.EVENT_STATUS, it) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun emit(name: String, payload: Map<String, Any?>) {
        val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
        val map = Arguments.makeNativeMap(payload as Map<String, Any>)
        dispatcher.dispatchEvent(WalletViewEvent(UIManagerHelper.getSurfaceId(reactContext), id, name, map))
    }

    // RN lays out native children only once; re-run layout when the PayButton
    // or status text changes so they actually appear. (A lambda, not a field:
    // the super constructor calls requestLayout before fields are initialized.)
    override fun requestLayout() {
        super.requestLayout()
        post {
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
            )
            layout(left, top, right, bottom)
        }
    }
}

private class WalletViewEvent(
    surfaceId: Int,
    viewId: Int,
    private val name: String,
    private val payload: WritableMap,
) : Event<WalletViewEvent>(surfaceId, viewId) {
    override fun getEventName(): String = name
    override fun getEventData(): WritableMap = payload
}
