import assert from 'node:assert'
import { describe, it } from 'node:test'
import { join } from 'path'
import { fileURLToPath } from 'url'

import { shell } from '../../src/lib/app-shell'
import type { Dispatcher } from '../../src/ui/dispatcher'
import { openFile } from '../../src/ui/lib/open-file'

function createMockDispatcher(postError: Dispatcher['postError']): Dispatcher {
  return { postError } as Dispatcher
}

describe('openFile', () => {
  const root = __WIN32__ ? 'C:\\repo' : '/repo'
  const urlRoot = __WIN32__ ? 'file:///C:/repo' : 'file:///repo'

  const paths = [
    ['readme.txt', 'readme.txt'],
    ['readme?notes.txt', 'readme%3Fnotes.txt'],
    ['readme#notes.txt', 'readme%23notes.txt'],
    ['readme%23notes.txt', 'readme%2523notes.txt'],
    ['readme%3Fnotes.txt', 'readme%253Fnotes.txt'],
    ['my notes.txt', 'my%20notes.txt'],
    ['caf\u00e9.txt', 'caf%C3%A9.txt'],
    ['notes #1?100%/readme.txt', 'notes%20%231%3F100%25/readme.txt'],
  ]

  for (const [path, encodedPath] of paths) {
    it(`opens the exact path for ${path}`, async t => {
      const openExternal = t.mock.method(
        shell,
        'openExternal',
        async () => true
      )
      const postError = t.mock.fn(async () => {})
      const fullPath = join(root, path)

      await openFile(fullPath, createMockDispatcher(postError))

      assert.strictEqual(openExternal.mock.callCount(), 1)
      const [url] = openExternal.mock.calls[0].arguments
      assert.strictEqual(url, `${urlRoot}/${encodedPath}`)
      assert.strictEqual(fileURLToPath(url), fullPath)
      assert.strictEqual(postError.mock.callCount(), 0)
    })
  }

  it('reports an opening failure using the original path', async t => {
    t.mock.method(shell, 'openExternal', async () => false)
    const postError = t.mock.fn(async (_error: Error) => {})
    const fullPath = join(root, 'my notes#1.txt')

    await openFile(fullPath, createMockDispatcher(postError))

    assert.strictEqual(postError.mock.callCount(), 1)
    assert.deepEqual(postError.mock.calls[0].arguments, [
      {
        name: 'no-external-program',
        message: `Unable to open file ${fullPath} in an external program. Please check you have a program associated with this file extension`,
      },
    ])
  })

  it('propagates unexpected opening errors', async t => {
    const error = new Error('Opening failed')
    t.mock.method(shell, 'openExternal', async () => {
      throw error
    })
    const postError = t.mock.fn(async () => {})

    await assert.rejects(
      openFile(join(root, 'readme.txt'), createMockDispatcher(postError)),
      error
    )

    assert.strictEqual(postError.mock.callCount(), 0)
  })
})
