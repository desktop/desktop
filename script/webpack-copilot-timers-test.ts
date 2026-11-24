import assert from 'node:assert/strict'
import { it } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import { runInNewContext } from 'vm'
import webpack from 'webpack'
import { renderer } from '../app/webpack.common'
import { createTempDirectory } from '../app/test/helpers/temp'

it('runs the Copilot SDK with Electron renderer globals', async t => {
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

    export async function checkInitializationContext() {
      const createClient = () => new CopilotClient({
        connection: RuntimeConnection.forStdio({ path: process.execPath }),
        useLoggedInUser: false,
      })
      const first = createClient()
      const second = createClient()
      await Promise.all([
        first.runInitializationCallback('first', async () => {
          await Promise.resolve()
          assert.equal(first.sessionInitializationContext.getStore()?.sessionId, 'first')
          assert.equal(second.sessionInitializationContext.getStore(), undefined)
        }),
        second.runInitializationCallback('second', async () => {
          await Promise.resolve()
          assert.equal(second.sessionInitializationContext.getStore()?.sessionId, 'second')
          assert.equal(first.sessionInitializationContext.getStore(), undefined)
        }),
      ])
      assert.equal(first.sessionInitializationContext.getStore(), undefined)
      assert.equal(second.sessionInitializationContext.getStore(), undefined)
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
      checkInitializationContext?: () => Promise<void>
    }
  } = { exports: {} }
  const rendererRequire = createRequire(join(__dirname, '../app/package.json'))
  const context = {
    module,
    require: (id: string) => {
      const exports = rendererRequire(id)
      if (id === 'node:async_hooks' || id === 'async_hooks') {
        return {
          ...exports,
          AsyncLocalStorage: class {
            public run() {
              throw new Error(
                'Native AsyncLocalStorage is unsafe in Electron renderers'
              )
            }
          },
        }
      }
      return exports
    },
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
  assert.ok(context.module.exports.checkInitializationContext)
  await context.module.exports.checkInitializationContext()
})
