import { Emitter, Disposable } from 'event-kit'
import { ipcRenderer } from 'electron'

export interface IUiActivityMonitor {
  onActivity(handler: () => void): Disposable
}

export type UiActivityKind = 'pointer' | 'keyboard' | 'menu'

export class UiActivityMonitor implements IUiActivityMonitor {
  private readonly emitter = new Emitter()
  private subscriberCount = 0

  public onActivity(handler: (kind: UiActivityKind) => void): Disposable {
    const emitterDisposable = this.emitter.on('activity', handler)

    if (this.subscriberCount++ === 0) {
      this.startTracking()
    }

    return new Disposable(() => {
      if (--this.subscriberCount === 0) {
        this.stopTracking()
      }

      emitterDisposable.dispose()
    })
  }

  private emit(kind: UiActivityKind) {
    this.emitter.emit('activity', kind)
  }

  private startTracking() {
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('keydown', this.onKeyDown)

    ipcRenderer.on('menu-event', this.onMenuEvent)
  }

  private stopTracking() {
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('keydown', this.onKeyDown)

    ipcRenderer.removeListener('menu-event', this.onMenuEvent)
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.target === null || !(e.target instanceof HTMLElement)) {
      return
    }

    if (!isInteractionTarget(e.target)) {
      return
    }

    this.emit('pointer')
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.emit('keyboard')
  }

  private onMenuEvent = (event: Electron.IpcMessageEvent) => {
    this.emit('menu')
  }
}

const interactionTargets = new Set(
  ['button', 'a', 'input', 'textarea'].map(x => x.toUpperCase())
)
const interactionRoles = new Set([
  'button',
  'option',
  'menuitem',
  'tab',
  'radio',
])

function isInteractionTarget(target: HTMLElement | null) {
  while (target !== null) {
    if (interactionTargets.has(target.nodeName)) {
      return true
    }

    const role = target.getAttribute('role')

    if (role !== null && interactionRoles.has(role)) {
      return true
    }

    target = target instanceof HTMLElement ? target.parentElement : null
  }

  return false
}
