import assert from 'node:assert'
import { describe, it } from 'node:test'
import { join } from 'path'

import { shell } from '../../src/lib/app-shell'
import type { Dispatcher } from '../../src/ui/dispatcher'
import { openFile } from '../../src/ui/lib/open-file'

function createMockDispatcher(postError: Dispatcher['postError']): Dispatcher {
  return { postError } as Dispatcher
}

describe('openFile', () => {
  const root = __WIN32__ ? 'C:\\repo' : '/repo'

  // The shell is given the path itself, never a URL, so every one of these must
  // arrive byte-for-byte unchanged. Non-ASCII paths are the regression this
  // guards: percent-encoding them into a file:// URL made Windows'
  // ShellExecuteW fail to resolve the file at all.
  const paths = [
    'readme.txt',
    'my notes.txt',
    'readme#notes.txt',
    'readme?notes.txt',
    'readme%23notes.txt',
    'notes #1?100%/readme.txt',
    'caf\u00e9.txt',
    '\u{1F41E}.txt',
    'SpecialSymbolTest\u{1F9D1}\u200D\u{1F4BB}/TestNote.md',
    '\u4E2D\u6587/readme.txt',
  ]

  for (const path of paths) {
    it(`passes the exact path to the shell for ${path}`, async t => {
      const openPath = t.mock.method(shell, 'openPath', async () => '')
      const postError = t.mock.fn(async () => {})
      const fullPath = join(root, path)

      await openFile(fullPath, createMockDispatcher(postError))

      assert.strictEqual(openPath.mock.callCount(), 1)
      assert.deepStrictEqual(openPath.mock.calls[0].arguments, [fullPath])
      assert.strictEqual(postError.mock.callCount(), 0)
    })
  }

  it('reports an opening failure using the original path', async t => {
    t.mock.method(shell, 'openPath', async () => 'Failed to open path')
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
    t.mock.method(shell, 'openPath', async () => {
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
