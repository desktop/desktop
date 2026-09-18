import assert from 'node:assert'
import { describe, it } from 'node:test'
import { shouldShowWorktreeDropdown } from '../../src/lib/worktree-dropdown'

describe('shouldShowWorktreeDropdown', () => {
  for (const count of [0, 1, 2, 3]) {
    for (const isOpen of [false, true]) {
      for (const alwaysShow of [false, true]) {
        it(`handles ${count} worktrees, open=${isOpen}, always show=${alwaysShow}`, () => {
          assert.strictEqual(
            shouldShowWorktreeDropdown(count, isOpen, alwaysShow),
            count > 1 || isOpen || alwaysShow
          )
        })
      }
    }
  }
})
