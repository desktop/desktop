import assert from 'node:assert'
import Fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, TestContext } from 'node:test'

import { Tailer } from '../../src/lib/tailer'
import { createTempDirectory } from '../helpers/temp'

async function setupTailer(t: TestContext) {
  const directory = await createTempDirectory(t)
  const path = join(directory, 'progress')
  await writeFile(path, 'first\n')

  const watch = t.mock.method(Fs, 'watch')
  const tailer = new Tailer(path)
  t.after(() => tailer.stop())
  tailer.start()

  const watcher = watch.mock.calls[0].result
  assert.ok(watcher)
  const close = t.mock.method(watcher, 'close')

  const nextStream = () =>
    new Promise<Fs.ReadStream>(resolve => {
      const subscription = tailer.onDataAvailable(stream => {
        subscription.dispose()
        t.after(() => stream.destroy())
        resolve(stream)
      })
      t.after(() => subscription.dispose())
    })

  return { tailer, watcher, close, nextStream }
}

describe('Tailer', { timeout: 5000 }, () => {
  it('reports read stream errors and stops watching', async t => {
    const { tailer, watcher, close, nextStream } = await setupTailer(t)
    const onError = t.mock.fn()
    tailer.onError(onError)
    const next = nextStream()
    watcher.emit('change', 'change')
    const stream = await next
    const error = Object.assign(new Error('Too many open files'), {
      code: 'EMFILE',
    })

    assert.doesNotThrow(() => stream.emit('error', error))
    assert.strictEqual(onError.mock.callCount(), 1)
    assert.strictEqual(onError.mock.calls[0].arguments[0], error)
    assert.strictEqual(close.mock.callCount(), 1)
  })
})
