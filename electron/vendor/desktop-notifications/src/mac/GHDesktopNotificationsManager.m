#import "GHDesktopNotificationsManager.h"

#import <UserNotifications/UserNotifications.h>

@interface GHDesktopNotificationsManager () <UNUserNotificationCenterDelegate>

@end

@implementation GHDesktopNotificationsManager

- (instancetype)init
{
  if ((self = [super init]))
  {
    [self configureNotificationsDelegate];
  }
  return self;
}

- (void)configureNotificationsDelegate
{
  UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;
}

- (void)getNotificationSettingsWithCompletionHandler:(void(^)(NSString *permission))completionHandler
{
  UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    NSString *permission = @"default";

    if (settings.authorizationStatus == UNAuthorizationStatusNotDetermined)
    {
      permission = @"default";
    }
    else if (settings.authorizationStatus == UNAuthorizationStatusDenied)
    {
      permission = @"denied";
    }
    else
    {
      permission = @"granted";
    }

    completionHandler(permission);
  }];
}

- (void)requestAuthorizationWithCompletionHandler:(void(^)(BOOL granted, NSError * _Nullable error))completionHandler
{
  UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
  [center
   requestAuthorizationWithOptions:UNAuthorizationOptionBadge | UNAuthorizationOptionSound | UNAuthorizationOptionAlert
   completionHandler:completionHandler];
}

- (void)showNotificationWithIdentifier:(NSString *)identifier
                                 title:(NSString *)title
                                  body:(NSString *)body
                              userInfo:(NSDictionary * _Nullable)userInfo
                    completionHandler:(void(^)(NSError * _Nullable error))completionHandler
{
  UNMutableNotificationContent* content = [[UNMutableNotificationContent alloc] init];
  content.title = [NSString localizedUserNotificationStringForKey:title arguments:nil];
  content.body = [NSString localizedUserNotificationStringForKey:body arguments:nil];
  content.sound = [UNNotificationSound defaultSound];

  if (userInfo != nil)
  {
    content.userInfo = userInfo;
  }

  // Create the request object.
  UNNotificationRequest* request = [UNNotificationRequest
        requestWithIdentifier:identifier content:content trigger:nil];

  UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];

  [center
    requestAuthorizationWithOptions:UNAuthorizationOptionBadge | UNAuthorizationOptionSound | UNAuthorizationOptionAlert
    completionHandler:^(BOOL granted, NSError *error) {

      if (error != nil || !granted)
      {
        NSLog(@"Permission to display notification wasn't granted: %@", error);
        completionHandler(error ?: [NSError errorWithDomain:@"GHDesktopNotificationManagerError" code:-1 userInfo:nil]);
        return;
      }

      [center addNotificationRequest:request withCompletionHandler:^(NSError * _Nullable error) {
        if (error != nil) {
            NSLog(@"Error posting notification: %@", error.localizedDescription);
            completionHandler(error);
            return;
        }

        completionHandler(nil);
      }];
  }];
}

- (void)removePendingNotificationRequestsWithIdentifiers:(NSArray<NSString *> *)identifiers
{
  UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
  [center removePendingNotificationRequestsWithIdentifiers:identifiers];
}

#pragma mark - UNUserNotificationCenterDelegate methods

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler
{
  if (self.completionHandler == nil)
  {
    completionHandler();
    return;
  }

  UNNotificationRequest *request = response.notification.request;
  self.completionHandler(@"click", request.identifier, request.content.userInfo, completionHandler);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  // This will make sure the notification is displayed even when the app is focused
  completionHandler(UNNotificationPresentationOptionAlert
                    | UNNotificationPresentationOptionBadge
                    | UNNotificationPresentationOptionSound);
}

@end
