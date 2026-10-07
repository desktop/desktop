import { supportsNotifications } from 'desktop-notifications'
import { getNotificationsPermission } from '../../ui/main-process-proxy'

/**
 * Whether OS permission allows notifications, or null if unavailable or unknown.
 *
 * Windows treats default permission as granted; other platforms do not.
 * Lookup failures are logged without interrupting reporting.
 */
export async function getSystemNotificationsPermission(): Promise<
  boolean | null
> {
  try {
    if (supportsNotifications()) {
      const permission = await getNotificationsPermission()
      return permission === 'granted' || (__WIN32__ && permission === 'default')
    }

    return typeof Notification === 'undefined'
      ? null
      : Notification.permission === 'granted'
  } catch (error) {
    log.warn('Failed to read system notification permission', error)
    return null
  }
}
