import * as Path from 'path'
import * as Fs from 'fs'

const fileUriToPath = require('file-uri-to-path') as (uri: string) => string
const sourceMapSupport = require('source-map-support')

/**
 * This array tells the source map logic which files that we can expect to
 * be able to resolve a source map for and they should reflect the chunks
 * entry names from our webpack config.
 */
const knownFilesWithSourceMap = [ 'renderer.js', 'main.js', 'shared.js' ]

export function enableSourceMaps() {
  sourceMapSupport.install({
    environment: 'node',
    handleUncaughtExceptions: false,
    retrieveSourceMap: function(source: string) {
      // This is a happy path in case we know for certain that we won't be
      // able to resolve a source map for the given location.
      if (!knownFilesWithSourceMap.some(file => source.endsWith(file))) {
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
