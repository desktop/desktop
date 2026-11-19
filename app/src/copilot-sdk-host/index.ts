import * as sdk from '@github/copilot-sdk'
import type { MessagePortMain } from 'electron'
import { serveCopilotSdkConnection } from '../lib/copilot/sdk-host'
import type {
  CopilotSdkHostChannel,
  CopilotSdkRequest,
  ICopilotSdkHostIdleMessage,
} from '../lib/copilot/sdk-host-protocol'

/**
 * Entry point of the utility process that runs the Copilot SDK.
 *
 * The main process sends one port per renderer `CopilotClient` (see
 * app/src/main-process/copilot-sdk-host-process.ts). Once no ports have been
 * open for a while, the host tells the main process it's idle so that it can
 * be stopped.
 */

const IdleTimeoutMs = 60 * 1000
const IdleCheckIntervalMs = 10 * 1000

let openPorts = 0
let receivedPorts = 0
let idleSince = Date.now()
let reportedIdle = false

function createChannel(port: MessagePortMain): CopilotSdkHostChannel {
  return {
    send: message => port.postMessage(message),
    onMessage: listener =>
      port.on('message', event => listener(event.data as CopilotSdkRequest)),
    onClose: listener => port.on('close', () => listener()),
    close: () => port.close(),
  }
}

process.parentPort.on('message', event => {
  const [port] = event.ports
  if (port === undefined) {
    return
  }
  receivedPorts++
  openPorts++
  reportedIdle = false
  serveCopilotSdkConnection(createChannel(port), sdk)
    .catch(error => console.error('Copilot SDK connection failed', error))
    .finally(() => {
      openPorts--
      idleSince = Date.now()
    })
  port.start()
})

// Also keeps the process alive until the main process stops it.
setInterval(() => {
  if (
    openPorts === 0 &&
    !reportedIdle &&
    Date.now() - idleSince >= IdleTimeoutMs
  ) {
    reportedIdle = true
    const message: ICopilotSdkHostIdleMessage = {
      type: 'idle',
      received: receivedPorts,
    }
    process.parentPort.postMessage(message)
  }
}, IdleCheckIntervalMs)
