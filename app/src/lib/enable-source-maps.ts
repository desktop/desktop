import * as Path from 'path'
import * as Fs from 'fs'

const fileUriToPath = require('file-uri-to-path') as (uri: string) => string
const sourceMapSupport = require('source-map-support')

// Can't use in dev builds because if the fs module is available source-maps-support always uses that
// regardless of the environment. We also want the node offset calculations that they do for environment node

export function enableSourceMaps() {
  sourceMapSupport.install({
    environment: 'node',
    handleUncaughtExceptions: false,
    retrieveSourceMap: function(source: string) {
      debugger
      if (!source.endsWith('renderer.js') && !source.endsWith('main.js') && !source.endsWith('shared.js')) {
        return null
      }

      // We get a file uri when we're inside a renderer, convert to a path
      if (source.startsWith('file://')) {
        source = fileUriToPath(source)
      }

      // We store our source maps right next to the bundle
      const path = `${source}.map`

      if (__DEV__ && path.startsWith('http://')) {
        try {
          const xhr = new XMLHttpRequest()
          xhr.open('GET', path, false)
          xhr.send(null)
          if (xhr.readyState === 4 && xhr.status === 200) {
            return { url: Path.basename(path), map: xhr.responseText }
          }
        } catch (error) {
          return
        }
        return
      }

      // We don't have an option here, see
      //  https://github.com/v8/v8/wiki/Stack-Trace-API#customizing-stack-traces
      // This happens on-demand when someone accesses the stack
      // property on an error object and has to be synchronous :/
      // tslint:disable-next-line:no-sync-functions
      if (!Fs.existsSync(path)) {
        return
      }

      try {
        // tslint:disable-next-line:no-sync-functions
        const map = Fs.readFileSync(path, 'utf8')
        return { url: Path.basename(path), map }
      } catch (error) {
        return
      }
    },
  })

}
