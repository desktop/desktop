import { cleanup } from '@testing-library/react'
import { afterEach } from 'node:test'

class TestResizeObserver {
  public observe() {}

  public unobserve() {}

  public disconnect() {}
}

if (globalThis.ResizeObserver === undefined) {
  Object.assign(globalThis, {
    ResizeObserver: TestResizeObserver,
  })
}

if (
  typeof window !== 'undefined' &&
  globalThis.CustomEvent !== window.CustomEvent
) {
  Object.assign(globalThis, {
    CustomEvent: window.CustomEvent,
    Event: window.Event,
  })
}

afterEach(() => cleanup())
