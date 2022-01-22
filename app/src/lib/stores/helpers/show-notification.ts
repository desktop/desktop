import * as remote from '@electron/remote'
import * as notifier from 'node-notifier'

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
    notifier.notify(
      {
        title,
        message: '5554' + body,
        appID: 'GitHub Desktop', //'com.squirrel.GitHubDesktop.GitHubDesktop',
        icon: 'no-image',
        wait: true,
      },
      (err, response, metadata) => {
        console.log('SOMETHING HAPPENED!', err, response, metadata)
      }
    )

    notifier.on('click', () => {
      console.log('clicked??')
      remote.getCurrentWindow().focus()
      onClick()
    })
    return
  }
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
