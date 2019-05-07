import { Disposable } from 'event-kit'

/**
 * Group log messages at runtime to help visualize and track where time is being
 * spent.
 *
 * Call `dispose()` on the returned value to close the grouping.
 */
export function groupLogMessages(label: string): Disposable {
  if (!__DEV__) {
    // avoid this work
    return new Disposable(() => {})
  }

  console.group(label)
  console.time(label)

  return new Disposable(() => {
    const hack = console as any
    hack.groupEnd(label)
    console.timeEnd(label)
  })
}
