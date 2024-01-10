import Dexie from 'dexie'
import {
  indexedDB as fakeIndexedDB,
  IDBKeyRange as fakeIDBKeyRange,
} from 'fake-indexeddb'
Dexie.dependencies.indexedDB = fakeIndexedDB
Dexie.dependencies.IDBKeyRange = fakeIDBKeyRange

// shims a bunch of browser specific methods
// like fetch, requestIdleCallback, etc
import 'airbnb-browser-shims/browser-only'
import 'setimmediate'

import { join } from 'path'
import { readFileSync } from 'fs'

// These constants are defined by Webpack at build time, but since tests aren't
// built with Webpack we need to make sure these exist at runtime.
const g: any = global
g['__WIN32__'] = process.platform === 'win32'
g['__DARWIN__'] = process.platform === 'darwin'
g['__LINUX__'] = process.platform === 'linux'
g['__APP_VERSION__'] = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
).version
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

// structuredClone doesn't exist in JSDOM, see:
// https://github.com/jsdom/jsdom/issues/3363
global.structuredClone ??= (x: any) => JSON.parse(JSON.stringify(x))
