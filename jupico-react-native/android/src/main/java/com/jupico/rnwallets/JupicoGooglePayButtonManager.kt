package com.jupico.rnwallets

import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.google.android.gms.wallet.button.ButtonConstants
import com.google.android.gms.wallet.button.ButtonOptions
import com.google.android.gms.wallet.button.PayButton

/** `JupicoGooglePayButton` host view: Google's official PayButton. */
class JupicoGooglePayButtonManager : SimpleViewManager<JupicoGooglePayButtonView>() {

    override fun getName(): String = "JupicoGooglePayButton"

    override fun createViewInstance(context: ThemedReactContext) = JupicoGooglePayButtonView(context)

    @ReactProp(name = "allowedPaymentMethods")
    fun setAllowedPaymentMethods(view: JupicoGooglePayButtonView, value: String?) {
        view.allowedPaymentMethods = value ?: "[]"
    }

    @ReactProp(name = "buttonTheme")
    fun setButtonTheme(view: JupicoGooglePayButtonView, value: String?) {
        view.buttonTheme = value ?: "dark"
    }

    @ReactProp(name = "buttonType")
    fun setButtonType(view: JupicoGooglePayButtonView, value: String?) {
        view.buttonType = value ?: "pay"
    }

    override fun onAfterUpdateTransaction(view: JupicoGooglePayButtonView) {
        super.onAfterUpdateTransaction(view)
        view.rebuildIfNeeded()
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
        mapOf(PressEvent.NAME to mapOf("registrationName" to "onWalletPress"))
}

class JupicoGooglePayButtonView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
    var allowedPaymentMethods = "[]"
        set(value) { if (field != value) { field = value; dirty = true } }
    var buttonTheme = "dark"
        set(value) { if (field != value) { field = value; dirty = true } }
    var buttonType = "pay"
        set(value) { if (field != value) { field = value; dirty = true } }

    private var dirty = true

    /** PayButton can only be initialized once, so options changes recreate it. */
    fun rebuildIfNeeded() {
        if (!dirty) return
        dirty = false
        removeAllViews()
        val button = PayButton(context)
        button.initialize(
            ButtonOptions.newBuilder()
                .setButtonTheme(
                    if (buttonTheme == "light") ButtonConstants.ButtonTheme.LIGHT
                    else ButtonConstants.ButtonTheme.DARK,
                )
                .setButtonType(type(buttonType))
                .setAllowedPaymentMethods(allowedPaymentMethods)
                .build(),
        )
        button.setOnClickListener { dispatchPress() }
        addView(button, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    private fun dispatchPress() {
        val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
        dispatcher.dispatchEvent(PressEvent(UIManagerHelper.getSurfaceId(reactContext), id))
    }

    // RN lays out native children only once; re-run layout when PayButton
    // inflates its content so it actually appears. (A lambda, not a field: the
    // super constructor calls requestLayout before fields are initialized.)
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

    private fun type(s: String): Int = when (s) {
        "buy" -> ButtonConstants.ButtonType.BUY
        "checkout" -> ButtonConstants.ButtonType.CHECKOUT
        "order" -> ButtonConstants.ButtonType.ORDER
        "subscribe" -> ButtonConstants.ButtonType.SUBSCRIBE
        "donate" -> ButtonConstants.ButtonType.DONATE
        "book" -> ButtonConstants.ButtonType.BOOK
        "plain" -> ButtonConstants.ButtonType.PLAIN
        else -> ButtonConstants.ButtonType.PAY
    }
}

private class PressEvent(surfaceId: Int, viewId: Int) : Event<PressEvent>(surfaceId, viewId) {
    override fun getEventName(): String = NAME
    override fun getEventData(): WritableMap = Arguments.createMap()

    companion object {
        const val NAME = "topWalletPress"
    }
}
