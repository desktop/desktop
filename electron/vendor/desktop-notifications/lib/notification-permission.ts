/**
 * Different types of notification permissions:
 * - "default": The user has not yet made a choice regarding whether to allow
 *  or deny notifications. On Windows, this is the same as "granted".
 * - "granted": The user has granted permission to display notifications.
 * - "denied": The user has denied permission to display notifications.
 */
export type DesktopNotificationPermission = 'default' | 'granted' | 'denied'
