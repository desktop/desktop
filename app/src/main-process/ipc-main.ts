import { RequestChannels, RequestResponseChannels } from '../lib/ipc-shared'
// eslint-disable-next-line no-restricted-imports
import { ipcMain } from 'electron'
import { IpcMainEvent, IpcMainInvokeEvent } from 'electron/main'

/**
 * Subscribes to the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcMain.on.
 */
export function on<T extends keyof RequestChannels>(
  channel: T,
  listener: (
    event: IpcMainEvent,
    ...args: Parameters<RequestChannels[T]>
  ) => void
) {
  ipcMain.on(channel, (event, ...args) => listener(event, ...(args as any)))
}

/**
 * Subscribes to the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcMain.once
 */
export function once<T extends keyof RequestChannels>(
  channel: T,
  listener: (
    event: IpcMainEvent,
    ...args: Parameters<RequestChannels[T]>
  ) => void
) {
  ipcMain.once(channel, (event, ...args) => listener(event, ...(args as any)))
}

/**
 * Subscribes to the specified invokeable IPC channel and provides strong typing
 * of the channel name, and request parameters. This is the equivalent of using
 * ipcMain.handle.
 */
export function handle<T extends keyof RequestResponseChannels>(
  channel: T,
  listener: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<RequestResponseChannels[T]>
  ) => ReturnType<RequestResponseChannels[T]>
) {
  ipcMain.handle(channel, (event, ...args) => listener(event, ...(args as any)))
}
