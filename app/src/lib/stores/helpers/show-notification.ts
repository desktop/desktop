import { remote } from 'electron'

/**
 * Shows a notification with a title, a body, and a function to handle when the
 * user clicks on the notification.
 */
export function showNotification(
  title: string,
  body: string,
  onClick: () => void
) {
  const notification = new Notification(title, {
    body,
  })

  notification.onclick = () => {
    remote.getCurrentWindow().focus()
    onClick()
  }
}
