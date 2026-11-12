import assert from 'node:assert/strict'
import { spawn } from 'child_process'
import { on, once } from 'events'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { finished } from 'stream/promises'
import { it } from 'node:test'

for (const cancellation of ['signal', 'message', 'disconnect']) {
  it(
    `cancels evaluation input collection through ${cancellation} without waiting for stdin EOF`,
    { skip: cancellation === 'signal' && process.platform === 'win32' },
    async t => {
      const root = join(__dirname, '../../..')
      const main = pathToFileURL(join(root, 'script/copilot-eval/main.mjs'))
      const child = spawn(
        process.execPath,
        [
          '--conditions=import',
          '--import',
          'tsx',
          '--import',
          './script/copilot-eval/bootstrap.mjs',
          '--input-type=module',
          '--eval',
          `const iterate = process.stdin[Symbol.asyncIterator].bind(process.stdin)
         process.stdin[Symbol.asyncIterator] = () => {
           process.send('reading')
           return iterate()
         }
         await import(${JSON.stringify(main.href)})`,
        ],
        { cwd: root, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }
      )
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit', {
            signal: AbortSignal.timeout(5000),
          })
          if (child.connected) {
            child.disconnect()
          }
          child.kill('SIGKILL')
          await exited
        }
        child.stdin?.destroy()
      })
      assert.ok(child.stdout)
      assert.ok(child.stderr)
      let output = ''
      let diagnostics = ''
      child.stdout.on('data', chunk => (output += chunk))
      child.stderr.on('data', chunk => (diagnostics += chunk))
      for await (const [message] of on(child, 'message', {
        signal: AbortSignal.timeout(30000),
      })) {
        if (message === 'reading') {
          break
        }
      }
      const deadline = AbortSignal.timeout(5000)
      const exited = once(child, 'exit', { signal: deadline })
      const drained = Promise.all([
        finished(child.stdout, { signal: deadline }),
        finished(child.stderr, { signal: deadline }),
      ])
      if (cancellation === 'signal') {
        child.kill('SIGTERM')
      } else if (cancellation === 'message') {
        assert.ok(child.send)
        child.send('cancel')
      } else {
        child.disconnect()
      }
      const [[code]] = await Promise.all([exited, drained]).catch(error => {
        throw new Error(
          `Worker did not finish (exit ${child.exitCode}, signal ${child.signalCode}): ${output}\n${diagnostics}`,
          { cause: error }
        )
      })
      assert.strictEqual(code, 1, diagnostics)
      assert.strictEqual(JSON.parse(output).error.code, 'cancelled')
    }
  )
}
