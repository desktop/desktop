import TransportStream from 'winston-transport'
import { LEVEL, MESSAGE } from 'triple-beam'

const logFunctions: Record<string, Console['log']> = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
}

/**
 * A thin re-implementation of winston's Console transport
 *
 * The Console transport shipped with Winston will fail to catch errors when
 * attempting to log after stderr/stdout has been closed. console.log in Node.js
 * specifically deals with this scenario[1] so instead of trying to detect
 * whether we're in a Node context or not like Winston does[2] we'll just use
 * console.* regardelss of whether we're in the renderer or in the main process.
 *
 * 1. https://github.com/nodejs/node/blob/916227b3ed041ff13d588b02f98e9be0846a5a7c/lib/internal/console/constructor.js#L277-L295
 * 2. https://github.com/winstonjs/winston/commit/4d52541df505c3fd464d92f3efd477e5ba3c935b
 */
export class DesktopConsoleTransport extends TransportStream {
  public log(info: any, callback: () => void) {
    setImmediate(() => this.emit('logged', info))

    // Winston users can use custom levels but Desktop only uses the levels
    // defined in the LogLevel type.
    //
    // Node.js only differentiates between warn and log but we'll use info and
    // debug here as well in case we're used in the renderer
    // https://github.com/nodejs/node/blob/916227b3ed041ff13d588b02f98e9be0846a5a7c/lib/internal/console/constructor.js#L666-L670
    const logFn = logFunctions[info[LEVEL]] ?? console.log

    // Surprisingly we are seeing rare crashes originating from within
    // console.log when the underlying stream is closed. Our understanding based
    // on reading the Node source code was that only stack overflow errors would
    // escape console.log (when _ignoreErrors is set to false that is) but
    // that's not what we're seeing so we'll safeguard here.
    try {
      logFn(info[MESSAGE])
    } catch {}

    callback?.()
  }
}
