import { ILog } from './logging/log'

/** Is the app running in dev mode? */
declare const __DEV__: boolean

/** The OAuth client id the app should use */
declare const __OAUTH_CLIENT_ID__: string | undefined

/** The OAuth secret the app should use. */
declare const __OAUTH_SECRET__: string | undefined

/** Is the app being built to run on Darwin? */
declare const __DARWIN__: boolean

/** Is the app being built to run on Win32? */
declare const __WIN32__: boolean

/** The environment for which the release was created. */
declare const __RELEASE_ENV__: 'production' | 'beta' | 'test' | 'development'

/** 
 * The currently executing process kind, this is specific to desktop
 * and identifies the processes that we have.
 */
declare const __PROCESS_KIND__: 'main' | 'ui' | 'shared' | 'crash' | 'askpass'

/**
 * Request an idle callback. See https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
 * for more information.
 */
declare function requestIdleCallback(fn: () => void, options?: { timeout: number }): number

declare const log: ILog
