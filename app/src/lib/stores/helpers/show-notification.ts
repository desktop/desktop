import * as remote from '@electron/remote'

/**
 * Shows a notification with a title, a body, and a function to handle when the
 * user clicks on the notification.
 */
export function showNotification(
  title: string,
  body: string,
  onClick: () => void
) {
  const notification = new remote.Notification({
    title,
    body,
  })

  notification.on('click', () => {
    remote.getCurrentWindow().focus()
    onClick()
  })

  notification.show()
}
