import { supportsNotifications } from './notification-support'
import { notificationCallback } from './notification-callback'
import { DesktopNotificationPermission } from './notification-permission'
import { INotificationOptions } from './notification-options'

// The native binary will be loaded lazily to avoid any possible crash at start
// time, which are harder to trace.
let _nativeModule: any | null | undefined = undefined

function getNativeModule(): any | null {
  if (_nativeModule !== undefined) {
    return _nativeModule
  }

  _nativeModule = supportsNotifications()
    ? require('../build/Release/desktop-notifications.node')
    : null

  return _nativeModule
}

/** Initializes the desktop-notifications system. */
export const initializeNotifications: (
  opts: INotificationOptions
) => void = opts =>
  getNativeModule()?.initializeNotifications(notificationCallback, opts)

/** Terminates the desktop-notifications system. */
export const terminateNotifications: () => void = () =>
  getNativeModule()?.terminateNotifications()

/** Gets the current state of the notifications permission. */
export const getNotificationsPermission: () => Promise<
  DesktopNotificationPermission
> = () => getNativeModule()?.getNotificationsPermission()

/** Requests the user to grant permission to display notifications. */
export const requestNotificationsPermission: () => Promise<boolean> = () =>
  getNativeModule()?.requestNotificationsPermission()

/**
 * Displays a system notification.
 * @param title Title of the notification
 * @param body Body of the notification
 * @param userInfo (Optional) An object with any information that needs to be
 * passed to the notification callback when the user clicks on the notification.
 * @returns The ID of the notification displayed. This ID can be used to close
 * the notification.
 */
export const showNotification: (
  title: string,
  body: string,
  userInfo?: Record<string, any>
) => Promise<string | null> = async (...args) => {
  const id = crypto.randomUUID()
  try {
    await getNativeModule()?.showNotification(id, ...args)
  } catch (e) {
    return null
  }
  return id
}

/** Closes the notification with the given ID. */
export const closeNotification: (id: string) => void = (...args) =>
  getNativeModule()?.closeNotification(...args)
