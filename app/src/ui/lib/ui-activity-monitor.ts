import { Emitter, Disposable } from 'event-kit'
import { ipcRenderer } from 'electron'

/**
 * Describes the interface of a UI activity monitor.
 *
 * We define a UI activity monitor as an object which can
 * be used to be notified whenever the user interacts with the
 * application.
 */
export interface IUiActivityMonitor {
  /**
   * Subscribe to get notified when the user interacts
   * with the application. The first, and only argument
   * to the event handler will be a value indicating the
   * kind of action detected (mouse/pointer, keyboard etc).
   *
   * @returns A disposable object which, when disposed will
   *          terminate the subscription and prevent any
   *          further calls to the handler.
   */
  onActivity(handler: (kind: UiActivityKind) => void): Disposable
}

/**
 * A value indicating a user activity type (mouse/pointer, keyboard etc).
 */
export type UiActivityKind = 'pointer' | 'keyboard' | 'menu'

/**
 * UI Activity monitor for user interactions within GitHub Desktop.
 */
export class UiActivityMonitor implements IUiActivityMonitor {
  private readonly emitter = new Emitter()
  private subscriberCount = 0

  /**
   * Subscribe to get notified when the user interacts
   * with the application. The first, and only argument
   * to the event handler will be a value indicating the
   * kind of action detected (mouse/pointer, keyboard etc).
   *
   * @returns A disposable object which, when disposed will
   *          terminate the subscription and prevent any
   *          further calls to the handler.
   */
  public onActivity(handler: (kind: UiActivityKind) => void): Disposable {
    const emitterDisposable = this.emitter.on('activity', handler)

    if (this.subscriberCount === 0) {
      this.startTracking()
    }

    this.subscriberCount++

    return new Disposable(() => {
      this.subscriberCount--

      if (this.subscriberCount === 0) {
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

  private onMenuEvent = (event: Electron.IpcRendererEvent) => {
    this.emit('menu')
  }
}

const interactionTargets = new Set(
  ['button', 'a', 'input', 'textarea', 'label'].map(x => x.toUpperCase())
)
const interactionRoles = new Set([
  'button',
  'option',
  'menuitem',
  'tab',
  'radio',
])

/**
 * Determine if the target of a pointer event is contained within,
 * or is itself, an "interaction target".
 *
 * We define an interaction target to be things like buttons, text
 * inputs, links, etc. We don't consider divs, spans, etc to be
 * interaction targets at the moment although they arguable would fit
 * the description when a user selects text within a span.
 */
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
