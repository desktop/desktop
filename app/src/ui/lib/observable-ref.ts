type RefCallback<T> = (instance: T | null) => void
export type ObservableRef<T> = {
  current: T | null
  subscribe: (cb: RefCallback<T>) => void
  unsubscribe: (cb: RefCallback<T>) => void
  (instance: T): void
}

/**
 * Creates an observable React Ref instance.
 *
 * Observable refs are similar to how refs from React.createRef works with the
 * exception that refs created using `createObservableRef` can notify consumers
 * when the underlying ref change without having to resort to callback refs.
 */
export function createObservableRef<T>(): ObservableRef<T> {
  const subscribers = new Set<RefCallback<T>>()

  const callback: ObservableRef<T> = Object.assign(
    (instance: T | null) => {
      callback.current = instance
      subscribers.forEach(cb => cb(instance))
    },
    {
      current: null,
      subscribe: (cb: RefCallback<T>) => subscribers.add(cb),
      unsubscribe: (cb: RefCallback<T>) => subscribers.delete(cb),
    }
  )

  return callback
}
