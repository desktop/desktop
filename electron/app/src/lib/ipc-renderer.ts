import { RequestResponseChannels, RequestChannels } from './ipc-shared'
// eslint-disable-next-line no-restricted-imports
import { ipcRenderer, IpcRendererEvent } from 'electron'

/**
 * Send a message to the main process via channel and expect a result
 * asynchronously. This is the equivalent of ipcRenderer.invoke except with
 * strong typing guarantees.
 */
export function invoke<T extends keyof RequestResponseChannels>(
  channel: T,
  ...args: Parameters<RequestResponseChannels[T]>
): ReturnType<RequestResponseChannels[T]> {
  return ipcRenderer.invoke(channel, ...args) as any
}

/**
 * Send a message to the main process via channel asynchronously. This is the
 * equivalent of ipcRenderer.send except with strong typing guarantees.
 */
export function send<T extends keyof RequestChannels>(
  channel: T,
  ...args: Parameters<RequestChannels[T]>
): void {
  return ipcRenderer.send(channel, ...args) as any
}

/**
 * Send a message to the main process via channel synchronously. This is the
 * equivalent of ipcRenderer.sendSync except with strong typing guarantees.
 */
export function sendSync<T extends keyof RequestChannels>(
  channel: T,
  ...args: Parameters<RequestChannels[T]>
): void {
  // eslint-disable-next-line no-sync
  return ipcRenderer.sendSync(channel, ...args) as any
}

/**
 * Subscribes to the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcRenderer.on.
 */
export function on<T extends keyof RequestChannels>(
  channel: T,
  listener: (
    event: IpcRendererEvent,
    ...args: Parameters<RequestChannels[T]>
  ) => void
) {
  ipcRenderer.on(channel, listener as any)
}

/**
 * Subscribes to the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcRenderer.once
 */
export function once<T extends keyof RequestChannels>(
  channel: T,
  listener: (
    event: IpcRendererEvent,
    ...args: Parameters<RequestChannels[T]>
  ) => void
) {
  ipcRenderer.once(channel, listener as any)
}

/**
 * Unsubscribes from the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcRenderer.removeListener
 */
export function removeListener<T extends keyof RequestChannels>(
  channel: T,
  listener: (
    event: IpcRendererEvent,
    ...args: Parameters<RequestChannels[T]>
  ) => void
) {
  ipcRenderer.removeListener(channel, listener as any)
}
