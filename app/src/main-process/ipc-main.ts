import { RequestChannels, RequestResponseChannels } from '../lib/ipc-shared'
// eslint-disable-next-line no-restricted-imports
import { ipcMain } from 'electron'
import { IpcMainEvent, IpcMainInvokeEvent } from 'electron/main'
import { encodePathAsUrl } from '../lib/path'

type RequestChannelListener<T extends keyof RequestChannels> = (
  event: IpcMainEvent,
  ...args: Parameters<RequestChannels[T]>
) => void

type RequestResponseChannelListener<T extends keyof RequestResponseChannels> = (
  event: IpcMainInvokeEvent,
  ...args: Parameters<RequestResponseChannels[T]>
) => ReturnType<RequestResponseChannels[T]>

/**
 * Subscribes to the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcMain.on.
 */
export function on<T extends keyof RequestChannels>(
  channel: T,
  listener: RequestChannelListener<T>
) {
  ipcMain.on(channel, safeListener(listener))
}

/**
 * Subscribes to the specified IPC channel and provides strong typing of
 * the channel name, and request parameters. This is the equivalent of
 * using ipcMain.once
 */
export function once<T extends keyof RequestChannels>(
  channel: T,
  listener: RequestChannelListener<T>
) {
  ipcMain.once(channel, safeListener(listener))
}

/**
 * Subscribes to the specified invokeable IPC channel and provides strong typing
 * of the channel name, and request parameters. This is the equivalent of using
 * ipcMain.handle.
 */
export function handle<T extends keyof RequestResponseChannels>(
  channel: T,
  listener: RequestResponseChannelListener<T>
) {
  ipcMain.handle(channel, safeListener(listener))
}

const validSenderUrl = encodePathAsUrl(__dirname, 'index.html').toString()

function safeListener(listener: (...args: any[]) => any) {
  return (event: IpcMainEvent | IpcMainInvokeEvent, ...args: any[]) => {
    if (event.senderFrame.url !== validSenderUrl) {
      log.error(
        `IPC message received from invalid sender: ${event.senderFrame.url}`
      )
      return
    }

    return listener(event, ...args)
  }
}
