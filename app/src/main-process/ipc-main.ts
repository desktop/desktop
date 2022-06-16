import { RequestChannels, RequestResponseChannels } from '../lib/ipc-shared'
// eslint-disable-next-line no-restricted-imports
import { ipcMain, app } from 'electron'
import { IpcMainEvent, IpcMainInvokeEvent } from 'electron/main'
import * as path from 'path'
import * as url from 'url'

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
  withVerifiedRequestSender(ipcMain.on, channel, listener)
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
  withVerifiedRequestSender(ipcMain.once, channel, listener)
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
  withVerifiedRequestResponseSender(ipcMain.handle, channel, listener)
}

function withVerifiedRequestSender<T extends keyof RequestChannels>(
  ipcFunction: typeof ipcMain.on | typeof ipcMain.once,
  channel: T,
  listener: RequestChannelListener<T>
) {
  ipcFunction(channel, (event, ...args) => {
    if (isValidSender(event.senderFrame.url)) {
      log.error(
        `IPC request channel ${channel} called from invalid sender: ${event.senderFrame.url}`
      )
      return
    }
    return listener(event, ...(args as any))
  })
}

function withVerifiedRequestResponseSender<
  T extends keyof RequestResponseChannels
>(
  ipcFunction: typeof ipcMain.handle,
  channel: T,
  listener: RequestResponseChannelListener<T>
) {
  ipcFunction(channel, (event, ...args) => {
    if (isValidSender(event.senderFrame.url)) {
      log.error(
        `IPC request-response channel ${channel} called from invalid sender: ${event.senderFrame.url}`
      )
      return
    }
    return listener(event, ...(args as any))
  })
}

function isValidSender(senderUrl: string) {
  const validSenderPath = path.join(app.getAppPath(), 'index.html')
  const validSenderUrl = url.pathToFileURL(validSenderPath).toString()
  return senderUrl === validSenderUrl
}
