import { supportsNotifications } from './notification-support'

/**
 * Returns the special URL that leads to the Notifications settings in the
 * current OS. On Windows, this is only available on versions 10+.
 */
export function getNotificationSettingsUrl() {
  if (!supportsNotifications()) {
    return null
  }

  return process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.preference.notifications'
    : 'ms-settings:notifications'
}
