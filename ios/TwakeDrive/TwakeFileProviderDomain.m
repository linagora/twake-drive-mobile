#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TwakeFileProviderDomain, NSObject)

RCT_EXTERN_METHOD(ensure:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(remove:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
