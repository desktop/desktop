#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^GHNotificationCompletionHandler)(
  NSString *event,
  NSString *identifier,
  NSDictionary *userInfo,
  dispatch_block_t completionHandler
);

API_AVAILABLE(macos(10.14))
@interface GHDesktopNotificationsManager : NSObject

@property(nonatomic, nullable) GHNotificationCompletionHandler completionHandler;

- (void)getNotificationSettingsWithCompletionHandler:(void(^)(NSString *permission))completionHandler;
- (void)requestAuthorizationWithCompletionHandler:(void(^)(BOOL granted, NSError * _Nullable error))completionHandler;

- (void)showNotificationWithIdentifier:(NSString *)identifier
                                 title:(NSString *)title
                                  body:(NSString *)body
                              userInfo:(NSDictionary * _Nullable)userInfo
                    completionHandler:(void(^)(NSError * _Nullable error))completionHandler;
- (void)removePendingNotificationRequestsWithIdentifiers:(NSArray<NSString *> *)identifiers;

@end

NS_ASSUME_NONNULL_END
