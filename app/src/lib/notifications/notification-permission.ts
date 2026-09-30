import {
  DesktopNotificationPermission,
  supportsNotifications,
} from 'desktop-notifications'
import { getNotificationsPermission } from '../../ui/main-process-proxy'

/** Gets OS notification permission, or null when notifications are unavailable. */
export async function getSystemNotificationsPermission(): Promise<DesktopNotificationPermission | null> {
  if (supportsNotifications()) {
    return getNotificationsPermission()
  }

  return typeof Notification === 'undefined' ? null : Notification.permission
}
