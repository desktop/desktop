type RefCallback<T> = (instance: T | null) => void
export type ObservableRef<T> = RefCallback<T> & {
  current: T | null
  subscribe: (cb: RefCallback<T>) => void
  unsubscribe: (cb: RefCallback<T>) => void
}

export function createObservableRef<T>(): ObservableRef<T> {
  const subscribers = new Set<RefCallback<T>>()

  const ref = {
    current: null as T | null,
    subscribe: (cb: RefCallback<T>) => subscribers.add(cb),
    unsubscribe: (cb: RefCallback<T>) => subscribers.delete(cb),
  }

  return Object.assign((instance: T | null) => {
    ref.current = instance
    subscribers.forEach(cb => cb(instance))
  }, ref)
}
