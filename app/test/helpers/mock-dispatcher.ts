import { Dispatcher } from '../../src/ui/dispatcher'

/** Create a recording-only dispatcher that rejects every unmocked operation. */
export function createMockDispatcher(
  overrides: Partial<Dispatcher>
): Dispatcher {
  return new Proxy(Dispatcher.prototype, {
    get(_target, property) {
      if (Object.hasOwn(overrides, property)) {
        return Reflect.get(overrides, property)
      }
      throw new Error(
        `No mock implementation registered for Dispatcher.${String(property)}`
      )
    },
  })
}
