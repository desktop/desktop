import { focusWindow } from '../../../ui/main-process-proxy'
import {
  DesktopNotification,
  initializeNotifications,
} from 'desktop-notifications'
import { findToastActivatorClsid } from '../../find-toast-activator-clsid'

let windowsToastActivatorClsid: string | undefined = undefined

function initializeWindowsNotifications() {
  if (windowsToastActivatorClsid !== undefined) {
    return
  }

  windowsToastActivatorClsid = findToastActivatorClsid()

  if (windowsToastActivatorClsid === undefined) {
    console.error(
      'Toast activator CLSID not found in any of the shortucts. Notifications will not work.'
    )
    return
  }

  console.log(`Found toast activator CLSID ${windowsToastActivatorClsid}`)
  initializeNotifications(windowsToastActivatorClsid)
}

/**
 * Shows a notification with a title, a body, and a function to handle when the
 * user clicks on the notification.
 */
export function showNotification(
  title: string,
  body: string,
  onClick: () => void
) {
  if (__WIN32__) {
    initializeWindowsNotifications()

    const notification = new DesktopNotification(title, body)
    notification.onclick = () => {
      focusWindow()
      onClick()
    }
    notification.show()
    return
  }

  const notification = new Notification(title, {
    body,
  })

  notification.onclick = () => {
    focusWindow()
    onClick()
  }
}
