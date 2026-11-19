import * as ipcRenderer from '../ipc-renderer'
import {
  CopilotSdkClientChannel,
  CopilotSdkRequest,
  CopilotSdkResponse,
} from './sdk-host-protocol'

let nextRequestId = 0
const pendingRequests = new Map<
  number,
  (port: MessagePort | undefined) => void
>()

function onCopilotSdkPort(event: Electron.IpcRendererEvent, requestId: number) {
  const resolve = pendingRequests.get(requestId)
  pendingRequests.delete(requestId)
  resolve?.(event.ports[0])
}

/**
 * Ask the main process for a port to the Copilot SDK host process, starting
 * the host if needed.
 */
export function requestCopilotSdkChannel(): Promise<CopilotSdkClientChannel> {
  if (nextRequestId === 0) {
    ipcRenderer.on('copilot-sdk-port', onCopilotSdkPort)
  }
  const requestId = nextRequestId++
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, port => {
      if (port === undefined) {
        reject(new Error('The Copilot SDK host process could not be started'))
      } else {
        resolve(createCopilotSdkClientChannel(port))
      }
    })
    ipcRenderer.send('request-copilot-sdk-port', requestId)
  })
}

/** Wrap a DOM message port to the SDK host. */
export function createCopilotSdkClientChannel(
  port: MessagePort
): CopilotSdkClientChannel {
  return {
    send: (message: CopilotSdkRequest) => port.postMessage(message),
    onMessage: listener => {
      port.onmessage = (event: MessageEvent<CopilotSdkResponse>) =>
        listener(event.data)
    },
    onClose: listener => port.addEventListener('close', () => listener()),
    close: () => port.close(),
  }
}
