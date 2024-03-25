import { IMenuItemState } from './menu-update'
import { MenuIDs } from '../models/menu-ids'
import { ISerializableMenuItem } from './menu-item'
import { MenuLabelsEvent } from '../models/menu-labels'
import { MenuEvent } from '../main-process/menu'
import { LogLevel } from './logging/log-level'
import { ICrashDetails } from '../crash/shared'
import { WindowState } from './window-state'
import { IMenu } from '../models/app-menu'
import { ILaunchStats } from './stats'
import { URLActionType } from './parse-app-url'
import { Architecture } from './get-architecture'
import { EndpointToken } from './endpoint-token'
import { PathType } from '../ui/lib/app-proxy'
import { ThemeSource } from '../ui/lib/theme-source'
import { DesktopNotificationPermission } from 'desktop-notifications/dist/notification-permission'
import { NotificationCallback } from 'desktop-notifications/dist/notification-callback'
import { DesktopAliveEvent } from './stores/alive-store'

/**
 * Defines the simplex IPC channel names we use from the renderer
 * process along with their signatures. This type is used from both
 * the renderer and the main process to ensure a common contract between
 * the two over the untyped IPC framework.
 */
export type RequestChannels = {
  'select-all-window-contents': () => void
  'dialog-did-open': () => void
  'update-menu-state': (
    state: Array<{ id: MenuIDs; state: IMenuItemState }>
  ) => void
  'renderer-ready': (time: number) => void
  'execute-menu-item-by-id': (id: string) => void
  'show-certificate-trust-dialog': (
    certificate: Electron.Certificate,
    message: string
  ) => void
  'get-app-menu': () => void
  'update-preferred-app-menu-item-labels': (labels: MenuLabelsEvent) => void
  'uncaught-exception': (error: Error) => void
  'send-error-report': (
    error: Error,
    extra: Record<string, string>,
    nonFatal: boolean
  ) => void
  'unsafe-open-directory': (path: string) => void
  'menu-event': (name: MenuEvent) => void
  log: (level: LogLevel, message: string) => void
  'will-quit': () => void
  'will-quit-even-if-updating': () => void
  'cancel-quitting': () => void
  'crash-ready': () => void
  'crash-quit': () => void
  'window-state-changed': (windowState: WindowState) => void
  error: (crashDetails: ICrashDetails) => void
  'zoom-factor-changed': (zoomFactor: number) => void
  'app-menu': (menu: IMenu) => void
  'launch-timing-stats': (stats: ILaunchStats) => void
  'url-action': (action: URLActionType) => void
  'certificate-error': (
    certificate: Electron.Certificate,
    error: string,
    url: string
  ) => void
  focus: () => void
  blur: () => void
  'update-accounts': (accounts: ReadonlyArray<EndpointToken>) => void
  'quit-and-install-updates': () => void
  'quit-app': () => void
  'minimize-window': () => void
  'maximize-window': () => void
  'unmaximize-window': () => void
  'close-window': () => void
  'auto-updater-error': (error: Error) => void
  'auto-updater-checking-for-update': () => void
  'auto-updater-update-available': () => void
  'auto-updater-update-not-available': () => void
  'auto-updater-update-downloaded': () => void
  'native-theme-updated': () => void
  'set-native-theme-source': (themeName: ThemeSource) => void
  'focus-window': () => void
  'notification-event': NotificationCallback<DesktopAliveEvent>
  'set-window-zoom-factor': (zoomFactor: number) => void
  'show-installing-update': () => void
  'install-windows-cli': () => void
  'uninstall-windows-cli': () => void
}

/**
 * Defines the duplex IPC channel names we use from the renderer
 * process along with their signatures. This type is used from both
 * the renderer and the main process to ensure a common contract between
 * the two over the untyped IPC framework.
 *
 * Return signatures must be promises
 */
export type RequestResponseChannels = {
  'get-path': (path: PathType) => Promise<string>
  'get-app-architecture': () => Promise<Architecture>
  'get-app-path': () => Promise<string>
  'is-running-under-arm64-translation': () => Promise<boolean>
  'move-to-trash': (path: string) => Promise<void>
  'show-item-in-folder': (path: string) => Promise<void>
  'show-contextual-menu': (
    items: ReadonlyArray<ISerializableMenuItem>,
    addSpellCheckMenu: boolean
  ) => Promise<ReadonlyArray<number> | null>
  'is-window-focused': () => Promise<boolean>
  'open-external': (path: string) => Promise<boolean>
  'is-in-application-folder': () => Promise<boolean | null>
  'move-to-applications-folder': () => Promise<void>
  'check-for-updates': (url: string) => Promise<Error | undefined>
  'get-current-window-state': () => Promise<WindowState | undefined>
  'get-current-window-zoom-factor': () => Promise<number | undefined>
  'resolve-proxy': (url: string) => Promise<string>
  'show-save-dialog': (
    options: Electron.SaveDialogOptions
  ) => Promise<string | null>
  'show-open-dialog': (
    options: Electron.OpenDialogOptions
  ) => Promise<string | null>
  'is-window-maximized': () => Promise<boolean>
  'get-apple-action-on-double-click': () => Promise<Electron.AppleActionOnDoubleClickPref>
  'should-use-dark-colors': () => Promise<boolean>
  'save-guid': (guid: string) => Promise<void>
  'get-guid': () => Promise<string>
  'show-notification': (
    title: string,
    body: string,
    userInfo?: DesktopAliveEvent
  ) => Promise<string | null>
  'get-notifications-permission': () => Promise<DesktopNotificationPermission>
  'request-notifications-permission': () => Promise<boolean>
}
