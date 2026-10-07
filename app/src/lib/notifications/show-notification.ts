import { focusWindow } from '../../ui/main-process-proxy'
import { supportsNotifications } from 'desktop-notifications'
import { showNotification as invokeShowNotification } from '../../ui/main-process-proxy'
import { notificationCallbacks } from './notification-handler'
import { DesktopAliveEvent } from '../stores/alive-store'
import { getSystemNotificationsPermission } from './notification-permission'

interface IShowNotificationOptions {
  title: string
  body: string
  userInfo?: DesktopAliveEvent
  onClick: () => void
}

/**
 * Shows a notification with a title, a body, and a function to handle when the
 * user clicks on the notification.
 *
 * Returns whether the notification was accepted with OS permission. HTML5
 * notifications report success through their show event. Native APIs cannot
 * confirm that a banner was visible (for example, when Focus mode is enabled).
 */
export async function showNotification(
  options: IShowNotificationOptions
): Promise<boolean> {
  // `supportNotifications` checks if `desktop-notifications` is supported by
  // the current platform. Otherwise, we'll rely on the HTML5 notification API.
  if (!supportsNotifications()) {
    if (typeof Notification === 'undefined') {
      log.warn('System notifications are unavailable')
      return false
    }

    let notification: Notification
    try {
      notification = new Notification(options.title, {
        body: options.body,
      })
    } catch (error) {
      log.warn('Failed to create system notification', error)
      return false
    }

    notification.onclick = () => {
      focusWindow()
      options.onClick()
    }
    return new Promise(resolve => {
      notification.onshow = () => resolve(true)
      notification.onerror = () => {
        log.warn('Failed to show system notification')
        resolve(false)
      }
    })
  }

  const notificationID = await invokeShowNotification(
    options.title,
    options.body,
    options.userInfo
  )
  if (notificationID === null) {
    log.warn('Failed to show system notification')
    return false
  }

  notificationCallbacks.set(notificationID, options.onClick)
  // Native macOS notifications may request permission while being shown.
  return (await getSystemNotificationsPermission()) === true
}
