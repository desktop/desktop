import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createReadStream } from 'fs'
import { Readable } from 'stream'
import { createTerminalStream } from '../../../src/lib/create-terminal-stream'
import { getFixturePath } from '../../helpers/fixture'

describe('terminal-stream', () => {
  it('can handle git clone progress', async () => {
    const ts = createTerminalStream()
    createReadStream(getFixturePath('clone-with-progress-output')).pipe(ts)
    const actual = await Readable.from(ts)
      .toArray()
      .then(chunks => chunks.join(''))
    const expected =
      `Cloning into 'linux'...\n` +
      `remote: Enumerating objects: 10460179, done.        \n` +
      `remote: Counting objects: 100% (165/165), done.        \n` +
      `remote: Compressing objects: 100% (106/106), done.        \n` +
      `remote: Total 10460179 (delta 94), reused 70 (delta 59), pack-reused 10460014 (from 1)        \n` +
      `Receiving objects: 100% (10460179/10460179), 5.05 GiB | 8.72 MiB/s, done.\n` +
      `Resolving deltas: 100% (8517403/8517403), done.\n` +
      `Updating files: 100% (86676/86676), done.\n`

    assert.equal(actual, expected)
  })

  it('can handle all kinds of chunk sizes', async () => {
    const ts = createTerminalStream()
    const buf = Buffer.alloc(2048)
    buf.fill('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    const buffers = new Array<Buffer>()

    const outputPromise = Readable.from(ts)
      .toArray()
      .then(chunks => chunks.join(''))

    for (let i = 1; i < 2048; i++) {
      ts.write(buf.subarray(0, i))
      buffers.push(buf.subarray(0, i))
    }

    for (let i = 2048; i > 0; i--) {
      ts.write(buf.subarray(0, i))
      buffers.push(buf.subarray(0, i))
    }

    ts.end()

    const actual = await outputPromise
    const expected = Buffer.concat(buffers).toString()

    assert.equal(actual, expected)
  })

  it('can handle empty buffers', async () => {
    const ts = createTerminalStream()

    const outputPromise = Readable.from(ts)
      .toArray()
      .then(chunks => chunks.join(''))

    ts.write(Buffer.alloc(0))
    ts.end()

    const actual = await outputPromise
    const expected = ''

    assert.equal(actual, expected)
  })
})
