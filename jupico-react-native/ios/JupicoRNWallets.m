#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>

// Exposes the Swift classes to React Native. Works under the New Architecture
// through RN's interop layer for legacy modules and view managers.

@interface RCT_EXTERN_MODULE(JupicoRNWallets, NSObject)

RCT_EXTERN_METHOD(canMakeApplePayments:(NSArray *)networks
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(presentApplePay:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(completeApplePay:(BOOL)success
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(JupicoApplePayButtonManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(buttonType, NSString)
RCT_EXPORT_VIEW_PROPERTY(buttonStyle, NSString)
RCT_EXPORT_VIEW_PROPERTY(cornerRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(onWalletPress, RCTDirectEventBlock)

@end
