#import <React/RCTBridgeModule.h>

// Registers the Swift `JupicoWallets` class with React Native and exposes its
// methods to JS. Works under both the legacy bridge and the New Architecture
// (via RN's interop layer). If you migrate to a pure Codegen TurboModule, this
// file is replaced by an implementation of the generated `NativeJupicoWallets`
// C++/ObjC++ spec — the Swift core (Layer 1) stays untouched.
@interface RCT_EXTERN_MODULE(JupicoWallets, NSObject)

RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(canMakePayments:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestPayment:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
