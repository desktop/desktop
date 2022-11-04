import { focusWindow } from '../../ui/main-process-proxy'
import { supportsNotifications } from 'desktop-notifications'
import { showNotification as invokeShowNotification } from '../../ui/main-process-proxy'
import { notificationCallbacks } from './notification-handler'
import { DesktopAliveEvent } from '../stores/alive-store'

interface IShowNotificationOptions {
  title: string
  body: string
  userInfo?: DesktopAliveEvent
  onClick: () => void
}

/**
 * Shows a notification with a title, a body, and a function to handle when the
 * user clicks on the notification.
 */
export async function showNotification(options: IShowNotificationOptions) {
  // `supportNotifications` checks if `desktop-notifications` is supported by
  // the current platform. Otherwise, we'll rely on the HTML5 notification API.
  if (!supportsNotifications()) {
    const notification = new Notification(options.title, {
      body: options.body,
    })

    notification.onclick = () => {
      focusWindow()
      options.onClick()
    }
    return
  }

  const notificationID = await invokeShowNotification(
    options.title,
    options.body,
    options.userInfo
  )
  if (notificationID !== null) {
    notificationCallbacks.set(notificationID, options.onClick)
  }
}
