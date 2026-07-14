import { describe, it } from 'node:test'
import { createMultiOperationTerminalOutputCallback } from '../../../src/lib/git/multi-operation-terminal-output'
import {
  git,
  TerminalOutput,
  TerminalOutputListener,
} from '../../../src/lib/git'
import assert from 'node:assert'

describe('git/multi-operation-terminal-output', () => {
  it('streams output from two git operations', async () => {
    const chunks: TerminalOutput[] = []

    const onTerminalOutputAvailable =
      createMultiOperationTerminalOutputCallback(function (cb) {
        cb(chunk => {
          chunks.push(chunk)
        })
      })

    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    assert.equal(chunks.length, 1, 'expected output from first git operation')
    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    assert.equal(chunks.length, 2, 'expected output from second git operation')
  })

  it('buffers output from two git operations', async () => {
    const chunks: TerminalOutput[] = []
    const holder: { subscribe?: TerminalOutputListener } = {}

    const onTerminalOutputAvailable =
      createMultiOperationTerminalOutputCallback(cb => {
        holder.subscribe = cb
      })

    assert.equal(holder.subscribe, undefined, 'expected subscriber to be set')

    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    await git(['version'], __dirname, '', { onTerminalOutputAvailable })

    assert(holder.subscribe !== undefined, 'expected subscriber to be set')

    holder.subscribe(chunk => {
      if (Array.isArray(chunk)) {
        chunks.push(...chunk)
      } else {
        chunks.push(chunk)
      }
    })

    assert.equal(
      chunks.length,
      2,
      'expected buffered output from both git operations'
    )
  })

  it('calls the original callback only once', async () => {
    let callcount = 0

    const onTerminalOutputAvailable =
      createMultiOperationTerminalOutputCallback(cb => {
        callcount++
      })

    assert.equal(callcount, 0, 'expected callback to be called once')

    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    assert.equal(callcount, 1, 'expected callback to be called once')
    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    assert.equal(callcount, 1, 'expected callback to be called once')
  })

  it('streams output untrimmed', async () => {
    const chunks: TerminalOutput[] = []

    const onTerminalOutputAvailable =
      createMultiOperationTerminalOutputCallback(function (cb) {
        cb(chunk => {
          chunks.push(chunk)
        })
      }, 10) // small capacity to trigger trimming

    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    assert.equal(chunks.length, 1, 'expected output from git operation')
    assert.ok(
      chunks[0].length > 10,
      'expected untrimmed output from git operation'
    )
  })

  it('trims buffered output', async () => {
    const chunks: TerminalOutput[] = []
    const holder: { subscribe?: TerminalOutputListener } = {}

    const onTerminalOutputAvailable =
      createMultiOperationTerminalOutputCallback(cb => {
        holder.subscribe = cb
      }, 10) // small capacity to trigger trimming

    assert.equal(holder.subscribe, undefined, 'expected subscriber to be set')

    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    await git(['version'], __dirname, '', { onTerminalOutputAvailable })

    assert(holder.subscribe !== undefined, 'expected subscriber to be set')

    holder.subscribe(chunk => {
      if (Array.isArray(chunk)) {
        chunks.push(...chunk)
      } else {
        chunks.push(chunk)
      }
    })

    assert.equal(chunks.length, 1, 'expected buffered output')
    assert.equal(
      chunks[0].length,
      10,
      'expected buffered output to be trimmed to capacity'
    )
  })

  it('handles multiple subscribers', async () => {
    const holder: { subscribe?: TerminalOutputListener } = {}

    const onTerminalOutputAvailable =
      createMultiOperationTerminalOutputCallback(cb => {
        holder.subscribe = cb
      }, 10) // small capacity to trigger trimming

    assert.equal(holder.subscribe, undefined, 'expected subscriber to be set')

    await git(['version'], __dirname, '', { onTerminalOutputAvailable })
    await git(['version'], __dirname, '', { onTerminalOutputAvailable })

    assert(holder.subscribe !== undefined, 'expected subscriber to be set')

    let subscriberOneLastChunk: TerminalOutput | null = null
    let subscriberTwoLastChunk: TerminalOutput | null = null

    holder.subscribe(chunk => (subscriberOneLastChunk = chunk))
    holder.subscribe(chunk => (subscriberTwoLastChunk = chunk))

    assert.ok(
      subscriberOneLastChunk !== null,
      'expected subscriber one to receive chunk'
    )
    assert.ok(
      subscriberTwoLastChunk !== null,
      'expected subscriber two to receive chunk'
    )
    assert.equal(subscriberOneLastChunk, subscriberTwoLastChunk)
  })
})
