import * as Path from 'path'
import * as Fs from 'fs'

const fileUriToPath = require('file-uri-to-path') as (uri: string) => string
const sourceMapSupport = require('source-map-support')

export function enableSourceMaps() {

  if (__DEV__) {
    // We can't do source maps in dev builds due to the inlined source
    // maps we use in webpack.
    return
  }

  sourceMapSupport.install({
    environment: 'node',
    handleUncaughtExceptions: false,
    retrieveSourceMap: function(source: string) {

      if (!source.endsWith('renderer.js') && !source.endsWith('main.js') && !source.endsWith('shared.js')) {
        return null
      }

      if (source.startsWith('file://')) {
        source = fileUriToPath(source)
      }

      const path = `${source}.map`

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
