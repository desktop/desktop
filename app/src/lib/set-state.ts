const componentCache = new WeakMap<
  React.Component<any, any>,
  Map<string, (value: any) => void>
>()

/**
 * Returns a memoized setter for a specific state key of a React component
 *
 * This can safely be used in event handlers to avoid creating new
 * closures on each render.
 */
export function setState<T extends React.Component, K extends keyof T['state']>(
  component: T,
  stateKey: K
) {
  let setters = componentCache.get(component)

  if (!setters) {
    setters = new Map()
    componentCache.set(component, setters)
  }

  const cachedSetter = setters.get(stateKey as string)

  if (cachedSetter) {
    return cachedSetter
  }

  const setter = (value: T['state'][K]) => {
    component.setState({ [stateKey]: value })
  }

  setters.set(stateKey as string, setter)

  return setter
}
