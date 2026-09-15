import * as os from 'os'

/**
 * Whether or not the current system supports these notifications. As of today,
 * only macOS and Windows 10+ are supported.
 */
export function supportsNotifications() {
  if (process.platform === 'darwin') {
    return supportsDarwinNotifications()
  }

  if (process.platform === 'win32') {
    return supportsWindowsNotifications()
  }

  return false
}

function supportsDarwinNotifications() {
  const versionComponents = os.release().split('.')
  const majorVersion = parseInt(versionComponents[0], 10)

  // Only macOS 10.14 and newer are supported. Since os.release() gives us the
  // Darwin kernel version, it should be a major version of 18 or higher, according
  // to https://en.wikipedia.org/wiki/Darwin_%28operating_system%29#Release_history
  return majorVersion >= 18
}

function supportsWindowsNotifications() {
  // The Windows Notification APIs we use are only available on Windows 10+, and
  // some of them are limited before the Creators Update (build 15063).
  // See: https://docs.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag?view=winrt-22621#remarks
  const CreatorsUpdateBuildNumber = 15063

  const versionComponents = os.release().split('.')
  const majorVersion = parseInt(versionComponents[0], 10)
  const buildNumber =
    versionComponents.length >= 3
      ? parseInt(versionComponents[2], 10)
      : CreatorsUpdateBuildNumber

  // Only Windows 10 (15063) and newer are supported
  return (
    majorVersion > 10 ||
    (majorVersion === 10 && buildNumber >= CreatorsUpdateBuildNumber)
  )
}

/**
 * Whether or not the current system supports asking the user for permission to
 * display notifications. As of today, only macOS supports this.
 */
export function supportsNotificationsPermissionRequest() {
  return process.platform === 'darwin' && supportsDarwinNotifications()
}
