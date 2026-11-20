import { MessageChannelMain, MessagePortMain, utilityProcess } from 'electron'
import * as Path from 'path'
import type { UtilityProcess } from 'electron'
import type { ICopilotSdkHostIdleMessage } from '../lib/copilot/sdk-host-protocol'

/**
 * The utility process running the Copilot SDK for every renderer
 * `CopilotClient`. It starts on demand and exits once it has been idle for a
 * while; see app/src/copilot-sdk-host/index.ts.
 */
let host: UtilityProcess | null = null

/** Ports handed to the current host, compared with its idle reports. */
let portsSent = 0

function isIdleMessage(
  message: unknown
): message is ICopilotSdkHostIdleMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'idle' &&
    'received' in message &&
    typeof message.received === 'number'
  )
}

function getHost(): UtilityProcess {
  if (host !== null) {
    return host
  }

  const child = utilityProcess.fork(
    Path.join(__dirname, 'copilot-sdk-host.js'),
    [],
    { serviceName: 'GitHub Desktop Copilot' }
  )
  child.on('message', message => {
    // Only stop a host that has received every port we've sent it, so a port
    // in flight isn't lost.
    if (
      child === host &&
      isIdleMessage(message) &&
      message.received === portsSent
    ) {
      log.info('Stopping idle Copilot SDK host')
      host = null
      child.kill()
    }
  })
  child.on('exit', code => {
    if (child === host) {
      log.warn(`Copilot SDK host exited unexpectedly with code ${code}`)
      host = null
    }
  })

  host = child
  portsSent = 0
  return child
}

/** Create a port to the Copilot SDK host, starting it if needed. */
export function createCopilotSdkHostPort(): MessagePortMain {
  const { port1, port2 } = new MessageChannelMain()
  getHost().postMessage(null, [port1])
  portsSent++
  return port2
}

/** Stop the Copilot SDK host, if it's running. */
export function stopCopilotSdkHost() {
  const child = host
  host = null
  child?.kill()
}
