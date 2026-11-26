import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { render, fireEvent } from '../../helpers/ui/render'
import {
  enableTestTimers,
  advanceTimersBy,
  resetTestTimers,
} from '../../helpers/ui/timers'
import { createObservableRef } from '../../../src/ui/lib/observable-ref'
import { Tooltip, TooltipDirection } from '../../../src/ui/lib/tooltip'

class CapturingResizeObserver {
  public static instances: Array<CapturingResizeObserver> = []

  public readonly observed = new Set<Element>()
  public disconnected = false

  public constructor(private readonly callback: ResizeObserverCallback) {
    CapturingResizeObserver.instances.push(this)
  }

  public observe(target: Element) {
    this.observed.add(target)
  }

  public unobserve(target: Element) {
    this.observed.delete(target)
  }

  public disconnect() {
    this.disconnected = true
    this.observed.clear()
  }

  public trigger(target: Element) {
    const entry = { target } as ResizeObserverEntry
    this.callback([entry], this)
  }
}

describe('Tooltip', () => {
  let originalGlobalResizeObserver: typeof ResizeObserver | undefined
  let originalWindowResizeObserver: typeof ResizeObserver | undefined
  let originalRequestAnimationFrame: typeof requestAnimationFrame | undefined
  let originalCancelAnimationFrame: typeof cancelAnimationFrame | undefined
  let nextFrameId = 1
  let pendingFrames: Map<number, FrameRequestCallback>
  let cancelledFrameIds: Array<number>

  beforeEach(() => {
    enableTestTimers(['setTimeout'])
    CapturingResizeObserver.instances = []
    nextFrameId = 1
    pendingFrames = new Map()
    cancelledFrameIds = []

    originalGlobalResizeObserver = globalThis.ResizeObserver
    originalWindowResizeObserver = window.ResizeObserver
    originalRequestAnimationFrame = globalThis.requestAnimationFrame
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame

    Object.assign(globalThis, { ResizeObserver: CapturingResizeObserver })
    Object.assign(window, { ResizeObserver: CapturingResizeObserver })

    const fakeRequestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = nextFrameId++
      pendingFrames.set(id, cb)
      return id
    }
    const fakeCancelAnimationFrame = (id: number) => {
      cancelledFrameIds.push(id)
      pendingFrames.delete(id)
    }

    Object.assign(globalThis, {
      requestAnimationFrame: fakeRequestAnimationFrame,
      cancelAnimationFrame: fakeCancelAnimationFrame,
    })
    Object.assign(window, {
      requestAnimationFrame: fakeRequestAnimationFrame,
      cancelAnimationFrame: fakeCancelAnimationFrame,
    })
  })

  afterEach(() => {
    resetTestTimers()
    Object.assign(globalThis, { ResizeObserver: originalGlobalResizeObserver })
    Object.assign(window, { ResizeObserver: originalWindowResizeObserver })
    Object.assign(globalThis, {
      requestAnimationFrame: originalRequestAnimationFrame,
      cancelAnimationFrame: originalCancelAnimationFrame,
    })
    Object.assign(window, {
      requestAnimationFrame: originalRequestAnimationFrame,
      cancelAnimationFrame: originalCancelAnimationFrame,
    })
  })

  function flushAnimationFrames() {
    const callbacks = [...pendingFrames.values()]
    pendingFrames.clear()
    act(() => {
      for (const callback of callbacks) {
        callback(0)
      }
    })
  }

  function renderTooltip() {
    const targetRef = createObservableRef<HTMLButtonElement>()
    const view = render(
      <div>
        <button ref={targetRef}>Target</button>
        <Tooltip
          target={targetRef}
          delay={0}
          direction={TooltipDirection.NORTH}
        >
          Tooltip content
        </Tooltip>
      </div>
    )

    const target = targetRef.current
    assert.ok(target !== null)
    target.getBoundingClientRect = () => new DOMRect(200, 200, 80, 30)

    fireEvent.mouseEnter(target)
    advanceTimersBy(0)

    const tooltip = document.body.querySelector<HTMLDivElement>(
      'div[role="tooltip"]'
    )
    assert.ok(tooltip !== null)

    return { view, target, tooltip }
  }

  it('defers ResizeObserver state updates until the next animation frame', () => {
    const { tooltip } = renderTooltip()
    const observer = CapturingResizeObserver.instances[0]
    assert.ok(observer !== undefined)

    let currentRect = new DOMRect(0, 0, 100, 20)
    tooltip.getBoundingClientRect = () => currentRect

    // Establish baseline size via an initial resize pass if needed.
    act(() => {
      observer.trigger(tooltip)
    })
    flushAnimationFrames()

    const initialTransform = tooltip.style.transform
    assert.ok(initialTransform.startsWith('translate('))

    // Grow tooltip width and trigger ResizeObserver twice before the next frame.
    currentRect = new DOMRect(0, 0, 220, 20)
    act(() => {
      observer.trigger(tooltip)
      observer.trigger(tooltip)
    })

    // Must not synchronously mutate tooltip layout inside the ResizeObserver callback.
    assert.strictEqual(tooltip.style.transform, initialTransform)
    assert.strictEqual(pendingFrames.size, 1)

    flushAnimationFrames()

    assert.notStrictEqual(tooltip.style.transform, initialTransform)
  })

  it('cancels pending resize animation frames and disconnects when hidden', () => {
    const { target, tooltip } = renderTooltip()
    const observer = CapturingResizeObserver.instances[0]
    assert.ok(observer !== undefined)

    tooltip.getBoundingClientRect = () => new DOMRect(0, 0, 160, 24)
    act(() => {
      observer.trigger(tooltip)
    })

    assert.strictEqual(pendingFrames.size, 1)
    const [scheduledId] = [...pendingFrames.keys()]

    fireEvent.mouseLeave(target)

    assert.strictEqual(document.body.querySelector('div[role="tooltip"]'), null)
    assert.ok(cancelledFrameIds.includes(scheduledId))
    assert.strictEqual(pendingFrames.size, 0)
    assert.strictEqual(observer.disconnected, true)
  })

  it('cancels pending resize animation frames and disconnects when unmounted', () => {
    const { view, tooltip } = renderTooltip()
    const observer = CapturingResizeObserver.instances[0]
    assert.ok(observer !== undefined)

    tooltip.getBoundingClientRect = () => new DOMRect(0, 0, 160, 24)
    act(() => {
      observer.trigger(tooltip)
    })

    assert.strictEqual(pendingFrames.size, 1)
    const [scheduledId] = [...pendingFrames.keys()]

    view.unmount()

    assert.ok(cancelledFrameIds.includes(scheduledId))
    assert.strictEqual(pendingFrames.size, 0)
    assert.strictEqual(observer.disconnected, true)
  })
})
