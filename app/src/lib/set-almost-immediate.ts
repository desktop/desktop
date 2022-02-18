/* eslint-disable set-almost-immediate */
import { enableSetAlmostImmediate } from './feature-flag'

/**
 * Reference created by setAlmostImmediate so that it can be cleared later.
 * It can be NodeJS.Immediate or number because we use a feature flag
 * to tweak the behavior of setAlmostImmediate, but this type should be used
 * as if it were opaque.
 */
export type AlmostImmediate = NodeJS.Immediate | number

/**
 * This function behaves almost like setImmediate, but it will rely on
 * setTimeout(..., 0) to actually execute the callback. The reason for this
 * is a bug in Electron sometimes causing setImmediate callbacks to not being
 * executed.
 * For more info about this: https://github.com/electron/electron/issues/29261
 */
export function setAlmostImmediate(
  callback: (...args: any[]) => void,
  ...args: any[]
): AlmostImmediate {
  return enableSetAlmostImmediate()
    ? window.setTimeout(callback, 0, ...args)
    : setImmediate(callback, ...args)
}

/** Used to clear references created by setAlmostImmediate. */
export function clearAlmostImmediate(almostImmediate: AlmostImmediate) {
  if (typeof almostImmediate === 'number') {
    clearTimeout(almostImmediate)
  } else {
    clearImmediate(almostImmediate)
  }
}
