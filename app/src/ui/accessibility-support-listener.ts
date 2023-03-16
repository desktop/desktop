import { Disposable } from 'event-kit'
import * as ipcRenderer from '../lib/ipc-renderer'

let accessibilitySupportEnabled = false
let subscribed = false

const listeners = new Set<(enabled: boolean) => void>()

const updateAccessibilitySupportEnabled = (
  _: Electron.IpcRendererEvent | undefined,
  enabled: boolean
) => {
  console.log(
    `Accessibility support ${enabled ? 'enabled' : 'disabled'}`,
    enabled
  )

  if (accessibilitySupportEnabled !== enabled) {
    accessibilitySupportEnabled = enabled
    listeners.forEach(listener => listener(enabled))
  }
}

export async function initializeAccessibilitySupportListener() {
  if (!subscribed) {
    ipcRenderer.on(
      'accessibility-support-changed',
      updateAccessibilitySupportEnabled
    )

    subscribed = true

    accessibilitySupportEnabled = await ipcRenderer
      .invoke('is-accessibility-support-enabled')
      .catch((err: Error) => {
        log.error('Failed to get accessibility support', err)
        return false
      })
  }
}

export const isAccessibilitySupportEnabled = () => accessibilitySupportEnabled
export const onAccessibilitySupportChanged = (
  listener: (enabled: boolean) => void
) => {
  listeners.add(listener)
  return new Disposable(() => listeners.delete(listener))
}
;(window as any).isAccessibilitySupportEnabled = () =>
  ipcRenderer.invoke('is-accessibility-support-enabled')
;(window as any).onAccessibilitySupportChanged = onAccessibilitySupportChanged
