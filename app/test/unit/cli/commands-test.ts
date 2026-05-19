import { describe, it } from 'node:test'
import assert from 'node:assert'
import { resolve } from 'path'

import { parseDesktopCLICommand } from '../../../src/cli/commands'

describe('parseDesktopCLICommand', () => {
  it('shows usage for help', () => {
    assert.deepStrictEqual(parseDesktopCLICommand(['help']), {
      kind: 'usage',
      exitCode: 0,
    })
  })

  it('opens the current directory by default', () => {
    assert.deepStrictEqual(parseDesktopCLICommand([]), {
      kind: 'open',
      path: resolve('.'),
    })
  })

  it('preserves existing open command behavior', () => {
    assert.deepStrictEqual(parseDesktopCLICommand(['open', 'relative-repo']), {
      kind: 'open',
      path: resolve('relative-repo'),
    })
  })

  it('preserves existing clone owner/name expansion', () => {
    assert.deepStrictEqual(
      parseDesktopCLICommand(['clone', 'desktop/desktop']),
      {
        kind: 'clone',
        url: 'https://github.com/desktop/desktop',
      }
    )
  })

  it('preserves existing clone branch parsing', () => {
    assert.deepStrictEqual(
      parseDesktopCLICommand(['clone', '-b', 'development', 'desktop/desktop']),
      {
        kind: 'clone',
        url: 'https://github.com/desktop/desktop',
        branch: 'development',
      }
    )
  })

  it('keeps numeric-looking clone branch names as strings', () => {
    assert.deepStrictEqual(
      parseDesktopCLICommand(['clone', '-b', '2026', 'desktop/desktop']),
      {
        kind: 'clone',
        url: 'https://github.com/desktop/desktop',
        branch: '2026',
      }
    )
  })

  it('requires at least one add-local path', () => {
    assert.deepStrictEqual(parseDesktopCLICommand(['add-local']), {
      kind: 'usage',
      exitCode: 1,
    })
  })

  it('parses one add-local path', () => {
    assert.deepStrictEqual(parseDesktopCLICommand(['add-local', 'repo-one']), {
      kind: 'add-local',
      paths: [resolve('repo-one')],
    })
  })

  it('parses multiple add-local paths in order', () => {
    assert.deepStrictEqual(
      parseDesktopCLICommand(['add-local', 'repo-one', 'repo-two']),
      {
        kind: 'add-local',
        paths: [resolve('repo-one'), resolve('repo-two')],
      }
    )
  })

  it('keeps numeric-looking add-local paths as strings', () => {
    assert.deepStrictEqual(parseDesktopCLICommand(['add-local', '2026']), {
      kind: 'add-local',
      paths: [resolve('2026')],
    })
  })
})
