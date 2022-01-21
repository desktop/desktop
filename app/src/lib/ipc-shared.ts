import { IMenuItemState } from './menu-update'
import { MenuIDs } from '../models/menu-ids'
import { ISerializableMenuItem } from './menu-item'
import { MenuLabelsEvent } from '../models/menu-labels'
import { MenuEvent } from '../main-process/menu'
import { LogLevel } from './logging/log-level'
import { WindowState } from './window-state'

/**
 * Defines the simplex IPC channel names we use from the renderer
 * process along with their signatures. This type is used from both
 * the renderer and the main process to ensure a common contract between
 * the two over the untyped IPC framework.
 */
export type RequestChannels = {
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
  'show-item-in-folder': (path: string) => void
  'show-folder-contents': (path: string) => void
  'menu-event': (name: MenuEvent) => void
  log: (level: LogLevel, message: string) => void
  'will-quit': () => void
  'window-state-changed': (windowState: WindowState) => void
  'app-menu': (menu: IMenu) => void
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
  'move-to-trash': (path: string) => Promise<void>
  'show-contextual-menu': (
    items: ReadonlyArray<ISerializableMenuItem>
  ) => Promise<ReadonlyArray<number> | null>
  'open-external': (path: string) => Promise<boolean>
}
