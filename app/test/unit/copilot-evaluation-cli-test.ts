import assert from 'node:assert/strict'
import { spawn } from 'child_process'
import { once } from 'events'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { it } from 'node:test'

it(
  'cancels evaluation input collection without waiting for stdin EOF',
  { skip: process.platform === 'win32' },
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
        child.kill('SIGKILL')
        await once(child, 'close')
      }
    })
    assert.ok(child.stdout)
    assert.ok(child.stderr)
    let output = ''
    let diagnostics = ''
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (diagnostics += chunk))
    await once(child, 'message', { signal: AbortSignal.timeout(30000) })
    const closed = once(child, 'close', { signal: AbortSignal.timeout(5000) })
    child.kill('SIGTERM')
    const [code] = await closed
    assert.strictEqual(code, 1, diagnostics)
    assert.strictEqual(JSON.parse(output).error.code, 'cancelled')
  }
)
