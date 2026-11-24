import { createHook } from 'async_hooks'

/**
 * Async operation context using public async-hooks callbacks.
 *
 * The Electron renderer cannot safely use Node's AsyncContextFrame-backed
 * AsyncLocalStorage: once optimized, getStore can receive Blink's
 * non-JavaScript task attribution data and fatally crash V8. See
 * app/src/lib/copilot/renderer-async-hooks.ts for details. Keep context in
 * JavaScript and propagate it through tracked async resources.
 */
export function createRepositoryOperationContext<T>() {
  const resources = new Map<number, T>()
  const stack: Array<T | undefined> = []
  let current: T | undefined

  createHook({
    init: asyncId => {
      if (current !== undefined) {
        resources.set(asyncId, current)
      }
    },
    before: asyncId => {
      stack.push(current)
      current = resources.get(asyncId)
    },
    after: () => {
      current = stack.pop()
    },
    destroy: asyncId => {
      resources.delete(asyncId)
    },
  }).enable()

  const run = <TResult>(
    value: T | undefined,
    operation: () => TResult
  ): TResult => {
    const previous = current
    current = value
    try {
      return operation()
    } finally {
      current = previous
    }
  }

  return {
    getStore: () => current,
    run,
    exit: <TResult>(operation: () => TResult) => run(undefined, operation),
  }
}
