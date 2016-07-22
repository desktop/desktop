/** Is the app running in dev mode? */
declare const __DEV__: boolean

declare function requestIdleCallback(fn: (timeRemaining: number, didTimeout: boolean) => void, options?: {timeout: number}): number
