import assert from 'node:assert'
import { describe, it } from 'node:test'
import { join } from 'path'
import { protectAssistedCommitResources } from '../../../src/lib/git/repository-operation'
import { generateWorktreeContextMenuItems } from '../../../src/ui/worktrees/worktree-list-item-context-menu'
import { createTempDirectory } from '../../helpers/temp'

describe('assisted shared worktree UI protection', () => {
  it('disables rename and delete through physical protection after the Git lease is gone', async t => {
    const root = await createTempDirectory(t)
    const path = join(root, 'linked')
    const protection = protectAssistedCommitResources(path)
    t.after(() => protection.release())
    const items = generateWorktreeContextMenuItems({
      path,
      isMainWorktree: false,
      isLocked: false,
      onRenameWorktree: () => {},
      onRemoveWorktree: () => {},
    })
    const mutations = items.filter(
      item =>
        'label' in item &&
        typeof item.label === 'string' &&
        ['Rename…', 'Delete…'].includes(item.label)
    )
    assert.strictEqual(mutations.length, 2)
    assert.ok(
      mutations.every(item => 'enabled' in item && item.enabled === false)
    )
    protection.release()
    const released = generateWorktreeContextMenuItems({
      path,
      isMainWorktree: false,
      isLocked: false,
      onRenameWorktree: () => {},
      onRemoveWorktree: () => {},
    }).filter(
      item =>
        'label' in item &&
        typeof item.label === 'string' &&
        ['Rename…', 'Delete…'].includes(item.label)
    )
    assert.ok(
      released.every(item => 'enabled' in item && item.enabled === true)
    )
  })
})
