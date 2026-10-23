import assert from 'node:assert/strict'
import { it } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import { runInNewContext } from 'vm'
import webpack from 'webpack'
import { renderer } from '../app/webpack.common'
import { createTempDirectory } from '../app/test/helpers/temp'

it('handles Copilot runtime exit with browser timer globals', async t => {
  const root = await createTempDirectory(t)
  const entry = join(root, 'index.js')
  await writeFile(
    entry,
    `
    import assert from 'node:assert/strict'
    import { EventEmitter } from 'node:events'
    import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk'

    export const browserTimer = () => {
      const timer = setTimeout(() => {}, 10000)
      clearTimeout(timer)
      return typeof timer
    }

    export async function checkRuntimeExit() {
      const client = new CopilotClient({
        connection: RuntimeConnection.forStdio({ path: process.execPath }),
        useLoggedInUser: false,
      })
      const child = new EventEmitter()
      let onClose
      let disposed = false
      client.cliProcess = child
      client.connection = {
        onNotification() {},
        onRequest() {},
        onError() {},
        onClose(callback) { onClose = callback },
        drain: () => Promise.resolve(),
        dispose() { disposed = true },
      }
      client.attachConnectionHandlers()
      child.emit('exit', 0)
      onClose()
      await Promise.resolve()
      assert.equal(disposed, true)
    }
    `
  )
  const compiler = webpack({
    ...renderer,
    mode: 'production',
    optimization: { minimize: false },
    entry,
    output: {
      path: join(root, 'out'),
      filename: 'bundle.js',
      publicPath: '',
      globalObject: 'globalThis',
      library: { type: 'commonjs2' },
    },
    resolve: {
      ...renderer.resolve,
      modules: [join(__dirname, '../app/node_modules'), 'node_modules'],
    },
    externals: ['koffi'],
  })
  assert.ok(compiler)
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        compiler.close(error => (error ? reject(error) : resolve()))
      )
  )
  const stats = await new Promise<webpack.Stats>((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        reject(error)
      } else if (stats === undefined) {
        reject(new Error('Webpack returned no compilation statistics'))
      } else {
        resolve(stats)
      }
    })
  })
  assert.equal(stats.hasErrors(), false, stats.toString('errors-only'))

  const timers = new Map<number, NodeJS.Timeout>()
  let nextTimer = 0
  t.after(() => timers.forEach(timer => clearTimeout(timer)))
  const module: {
    exports: {
      browserTimer?: () => string
      checkRuntimeExit?: () => Promise<void>
    }
  } = { exports: {} }
  const context = {
    module,
    require: createRequire(join(__dirname, '../app/package.json')),
    process,
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    AbortController,
    console,
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++nextTimer
      timers.set(id, setTimeout(callback, delay))
      return id
    },
    clearTimeout: (id: number) => {
      clearTimeout(timers.get(id))
      timers.delete(id)
    },
  }
  runInNewContext(await readFile(join(root, 'out/bundle.js'), 'utf8'), context)
  assert.ok(context.module.exports.browserTimer)
  assert.ok(context.module.exports.checkRuntimeExit)
  assert.equal(context.module.exports.browserTimer(), 'number')
  await context.module.exports.checkRuntimeExit()
  assert.equal(timers.size, 0)
})
