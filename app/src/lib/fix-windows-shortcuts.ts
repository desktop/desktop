import * as path from 'path'
import * as os from 'os'
import { shell } from 'electron'

/**
 * Fixes all Windows shortcuts created by Squirrel if needed by removing the toast activator CLSID property
 * from them.
 *
 * This is necessary in order to get notified about 'click' events on our notifications, as long as
 * Electron doesn't implement a COM activator (see https://docs.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/send-local-toast-other-apps).
 *
 * The COM activator will be required in order to get interactions on notifications from the Windows
 * Action Center.
 */
export function fixAllWindowsShortcuts() {
  const shortcutPaths = [
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'GitHub, Inc',
      'GitHub Desktop.lnk'
    ),
    path.join(os.homedir(), 'Desktop', 'GitHub Desktop.lnk'),
  ]

  for (const shortcutPath of shortcutPaths) {
    fixWindowsShortcut(shortcutPath)
  }
}

function fixWindowsShortcut(shortcutPath: string) {
  try {
    const shortcutDetails = shell.readShortcutLink(shortcutPath)
    if (
      shortcutDetails.toastActivatorClsid === undefined ||
      shortcutDetails.toastActivatorClsid === ''
    ) {
      return
    }

    console.info(
      `Found previous shortcut with toast activator CLSID in ${shortcutPath}. Fixing it...`
    )

    shell.writeShortcutLink(shortcutPath, 'replace', {
      ...shortcutDetails,
      toastActivatorClsid: '',
    })
  } catch (error) {
    console.error(`Error checking/fixing shortcut ${shortcutPath}`, error)
  }
}
