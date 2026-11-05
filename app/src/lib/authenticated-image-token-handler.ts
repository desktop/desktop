import { IpcRendererEvent } from 'electron'
import * as ipcRenderer from './ipc-renderer'

/**
 * Resolves private image credentials in the renderer, where account refresh
 * state lives. Returns a function to remove the listener.
 */
export function installAuthenticatedImageTokenHandler(
  resolveToken: (endpoint: string, token: string) => Promise<string>,
  ipc: Pick<typeof ipcRenderer, 'on' | 'send' | 'removeListener'> = ipcRenderer
) {
  let disposed = false
  const listener = async (
    _event: IpcRendererEvent,
    requestId: number,
    endpoint: string,
    token: string
  ) => {
    let resolvedToken: string | null = null
    try {
      resolvedToken = await resolveToken(endpoint, token)
    } catch {
      // Errors from refresh exchanges may contain credentials.
      log.warn('Unable to resolve authentication for a private image')
    }

    if (!disposed) {
      ipc.send('resolved-image-token', requestId, resolvedToken)
    }
  }
  ipc.on('resolve-image-token', listener)

  return () => {
    disposed = true
    ipc.removeListener('resolve-image-token', listener)
  }
}
