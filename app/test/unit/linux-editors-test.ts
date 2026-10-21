import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEditorPath } from '../../src/lib/editors/linux'

describe('resolveEditorPath', () => {
  const home = '/home/octocat'

  it('leaves absolute paths untouched', () => {
    assert.equal(resolveEditorPath('/usr/bin/code', home), '/usr/bin/code')
  })

  it('resolves relative paths against the home directory', () => {
    assert.equal(
      resolveEditorPath('.local/share/JetBrains/Toolbox/scripts/idea', home),
      '/home/octocat/.local/share/JetBrains/Toolbox/scripts/idea'
    )
  })

  it('expands a leading tilde to the home directory', () => {
    assert.equal(
      resolveEditorPath('~/.local/bin/zed', home),
      '/home/octocat/.local/bin/zed'
    )
  })
})
