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
    focusWindow()
    const callback = notificationCallbacks.get(id)
    if (callback !== undefined) {
      callback?.()
      notificationCallbacks.delete(id)
      return
    }

    notificationsStore.onNotificationEventReceived(event, id, userInfo)
  })
}
