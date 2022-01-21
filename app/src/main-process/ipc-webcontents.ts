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
  webContents.send(channel, ...args)
}
