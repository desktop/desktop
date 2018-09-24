/// <reference path="../src/lib/globals.d.ts" />

import 'mocha'
import { use } from 'chai'
use(require('chai-datetime'))

// These constants are defined by Webpack at build time, but since tests aren't
// built with Webpack we need to make sure these exist at runtime.
const g: any = global
g['__WIN32__'] = process.platform === 'win32'
g['__DARWIN__'] = process.platform === 'darwin'
g['__LINUX__'] = process.platform === 'linux'
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
