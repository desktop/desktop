import {
  DesktopNotificationPermission,
  supportsNotifications,
} from 'desktop-notifications'
import { getNotificationsPermission } from '../../ui/main-process-proxy'

/** OS permission, unknown on lookup failure, or null when no API is available. */
export type SystemNotificationsPermission =
  | DesktopNotificationPermission
  | 'unknown'
  | null

/** Gets OS notification permission without interrupting reporting on failure. */
export async function getSystemNotificationsPermission(): Promise<SystemNotificationsPermission> {
  try {
    if (supportsNotifications()) {
      return await getNotificationsPermission()
    }

    return typeof Notification === 'undefined' ? null : Notification.permission
  } catch (error) {
    log.warn('Failed to read system notification permission', error)
    return 'unknown'
  }
}
