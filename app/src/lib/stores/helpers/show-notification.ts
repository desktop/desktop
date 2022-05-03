import { focusWindow } from '../../../ui/main-process-proxy'
import { supportsNotifications } from 'desktop-notifications'
import { showNotification as invokeShowNotification } from '../../../ui/main-process-proxy'
import QuickLRU from 'quick-lru'
import { ipcRenderer } from 'electron'

const notificationCallbacks = new QuickLRU<string, () => void>({
  maxSize: 200,
})

export function initializeRendererNotificationHandler() {
  ipcRenderer.on('notification-event', (_, event, id, userInfo) => {
    focusWindow()
    const callback = notificationCallbacks.get(id)
    callback?.()
    notificationCallbacks.delete(id)
  })
}

/**
 * Shows a notification with a title, a body, and a function to handle when the
 * user clicks on the notification.
 */
export async function showNotification(
  title: string,
  body: string,
  onClick: () => void
) {
  if (!supportsNotifications()) {
    const notification = new Notification(title, {
      body,
    })

    notification.onclick = () => {
      focusWindow()
      onClick()
    }
    return
  }

  const notificationID = await invokeShowNotification(title, body)
  notificationCallbacks.set(notificationID, onClick)
}
