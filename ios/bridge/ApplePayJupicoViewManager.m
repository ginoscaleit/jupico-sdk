#import <React/RCTViewManager.h>

// Registers the Swift `ApplePayJupicoViewManager` so JS can render
// <ApplePayJupico>. Works under the New Architecture via RN's legacy view interop.
@interface RCT_EXTERN_MODULE(ApplePayJupicoViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(sessions, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(merchantIdentifier, NSString)
RCT_EXPORT_VIEW_PROPERTY(disabled, BOOL)
RCT_REMAP_VIEW_PROPERTY(buttonStyle, buttonStyleName, NSString)
RCT_EXPORT_VIEW_PROPERTY(onTransactionComplete, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSubmitError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onStatusChange, RCTDirectEventBlock)

@end
