/* eslint-disable no-loosely-typed-webcontents-ipc */

import { WebContents } from 'electron'
import { RequestChannels } from '../lib/ipc-shared'

/**
 * Send a message to a renderer process via its webContents asynchronously. This
 * is the equivalent of webContents.send except with strong typing guarantees.
 */
export function send<T extends keyof RequestChannels>(
  webContents: WebContents,
  channel: T,
  ...args: Parameters<RequestChannels[T]>
): void {
  if (webContents.isDestroyed()) {
    const msg = `failed to send on ${channel}, webContents was destroyed`
    if (__DEV__) {
      throw new Error(msg)
    }
    log.error(msg)
  } else {
    webContents.send(channel, ...args)
  }
}
