import { describe, it } from 'node:test'
import assert from 'node:assert'

import { getCLIActionFromCommandLineArgs } from '../../../src/main-process/cli-actions'

describe('getCLIActionFromCommandLineArgs', () => {
  it('returns no action when no trusted CLI switch is present', () => {
    assert.strictEqual(getCLIActionFromCommandLineArgs({}), null)
  })

  it('parses cli-open', () => {
    assert.deepStrictEqual(
      getCLIActionFromCommandLineArgs({ 'cli-open': '/tmp/repo' }),
      {
        kind: 'open-repository',
        path: '/tmp/repo',
      }
    )
  })

  it('parses repeated cli-add-local values', () => {
    assert.deepStrictEqual(
      getCLIActionFromCommandLineArgs({
        'cli-add-local': ['/tmp/repo-one', '/tmp/repo-two'],
      }),
      {
        kind: 'add-local-repositories',
        paths: ['/tmp/repo-one', '/tmp/repo-two'],
      }
    )
  })

  it('parses one cli-add-local value', () => {
    assert.deepStrictEqual(
      getCLIActionFromCommandLineArgs({ 'cli-add-local': '/tmp/repo-one' }),
      {
        kind: 'add-local-repositories',
        paths: ['/tmp/repo-one'],
      }
    )
  })

  it('ignores non-string cli-add-local values', () => {
    assert.strictEqual(
      getCLIActionFromCommandLineArgs({ 'cli-add-local': true }),
      null
    )
  })

  it('parses cli-clone with optional branch', () => {
    assert.deepStrictEqual(
      getCLIActionFromCommandLineArgs({
        'cli-clone': 'https://github.com/desktop/desktop',
        'cli-branch': 'development',
      }),
      {
        kind: 'clone-url',
        url: 'https://github.com/desktop/desktop',
        branch: 'development',
      }
    )
  })
})
