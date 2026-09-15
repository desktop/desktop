import { WebContents } from 'electron'

// WebContents id of trusted senders of IPC messages. This is used to verify
// that only IPC messages sent from trusted senders are handled, as recommended
// by the Electron security documentation:
// https://github.com/electron/electron/blob/main/docs/tutorial/security.md#17-validate-the-sender-of-all-ipc-messages
const trustedSenders = new Set<number>()

/** Adds a WebContents instance to the set of trusted IPC senders. */
export const addTrustedIPCSender = (wc: WebContents) => {
  trustedSenders.add(wc.id)
  wc.on('destroyed', () => trustedSenders.delete(wc.id))
}

/** Returns true if the given WebContents is a trusted sender of IPC messages. */
export const isTrustedIPCSender = (wc: WebContents) => trustedSenders.has(wc.id)
