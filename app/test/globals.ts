// This shouldn't be necessary, but without this CI fails on Windows. Seems to
// be a bug in TS itself or ts-node.
/// <reference path="../../node_modules/@types/node/index.d.ts" />

import 'mocha'
import 'chai-datetime'

// These constants are defined by Webpack at build time, but since tests aren't
// built with Webpack we need to make sure these exist at runtime.
const g: any = global
g['__WIN32__'] = process.platform === 'win32'
g['__DARWIN__'] = process.platform === 'darwin'
g['__RELEASE_ENV__'] = 'development'
