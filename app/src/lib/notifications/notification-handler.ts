import QuickLRU from 'quick-lru'
import * as ipcRenderer from '../ipc-renderer'
import { focusWindow } from '../../ui/main-process-proxy'
import { NotificationsStore } from '../stores/notifications-store'

export const notificationCallbacks = new QuickLRU<string, () => void>({
  maxSize: 200,
})

export function initializeRendererNotificationHandler(
  notificationsStore: NotificationsStore
) {
  ipcRenderer.on('notification-event', (_, event, id, userInfo) => {
    if (event !== 'click') {
      return
    }

    focusWindow()
    const callback = notificationCallbacks.get(id)
    if (callback !== undefined) {
      callback?.()
      notificationCallbacks.delete(id)
      return
    }

    // For notifications without a callback (from previous app sessions), we'll
    // let the notifications store to retreive the necessary data and handle
    // the event.
    notificationsStore.onNotificationEventReceived(event, id, userInfo)
  })
}
