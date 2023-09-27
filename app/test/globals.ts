import Dexie from 'dexie'
Dexie.dependencies.indexedDB = require('fake-indexeddb')
Dexie.dependencies.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange')

// shims a bunch of browser specific methods
// like fetch, requestIdleCallback, etc
import 'airbnb-browser-shims/browser-only'
import { join } from 'path'

// These constants are defined by Webpack at build time, but since tests aren't
// built with Webpack we need to make sure these exist at runtime.
const g: any = global
g['__WIN32__'] = process.platform === 'win32'
g['__DARWIN__'] = process.platform === 'darwin'
g['__LINUX__'] = process.platform === 'linux'
g['__APP_VERSION__'] = require(join(__dirname, '../package.json')).version
g['__DEV__'] = 'false'
g['__RELEASE_CHANNEL__'] = 'development'
g['__UPDATES_URL__'] = ''
g['__SHA__'] = 'test'

g['log'] = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
} as IDesktopLogger

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
g.DOMRect = class DOMRect {
  public constructor() {}
}

g.ResizeObserver = class ResizeObserver {
  public constructor(cb: any) {
    ;(this as any).cb = cb
  }

  public observe() {
    ;(this as any).cb([{ borderBoxSize: { inlineSize: 0, blockSize: 0 } }])
  }

  public unobserve() {}
}
