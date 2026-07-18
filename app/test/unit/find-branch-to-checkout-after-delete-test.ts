import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Branch, BranchType } from '../../src/models/branch'
import { WorktreeEntry } from '../../src/models/worktree'
import { findBranchToCheckoutAfterDelete } from '../../src/lib/stores/helpers/find-branch-to-checkout-after-delete'

function branch(name: string): Branch {
  return new Branch(
    name,
    null,
    { sha: '0'.repeat(40) },
    BranchType.Local,
    `refs/heads/${name}`
  )
}

function worktree(
  path: string,
  branchRef: string | null,
  type: 'main' | 'linked' = 'linked'
): WorktreeEntry {
  return {
    path,
    head: '0'.repeat(40),
    branch: branchRef,
    isDetached: branchRef === null,
    type,
    isLocked: false,
    isPrunable: false,
  }
}

describe('findBranchToCheckoutAfterDelete', () => {
  it('returns null when the branch to delete is not currently checked out', () => {
    const result = findBranchToCheckoutAfterDelete(
      branch('feature'),
      branch('main'),
      branch('main'),
      [],
      [],
      '/repo'
    )
    assert.strictEqual(result, null)
  })

  it('returns the default branch when it is not in use elsewhere', () => {
    const result = findBranchToCheckoutAfterDelete(
      branch('feature'),
      branch('feature'),
      branch('main'),
      [],
      [worktree('/repo', 'refs/heads/feature', 'main')],
      '/repo'
    )
    assert.strictEqual(result?.name, 'main')
  })

  // Reproduces https://github.com/desktop/desktop/issues/22569:
  // Main worktree has featurebranch1 checked out, a second worktree has the
  // default branch ('main') checked out. Deleting featurebranch1 must not
  // pick 'main' as the fallback, since it's already in use by worktree2 -
  // doing so would just move the "used by worktree" git failure from the
  // delete to this checkout, leaving featurebranch1 still checked out and
  // the delete doomed to fail as well.
  it('does not pick the default branch when it is checked out in another worktree', () => {
    const worktrees = [
      worktree('/repo', 'refs/heads/featurebranch1', 'main'),
      worktree('/repo-worktree2', 'refs/heads/main'),
    ]

    // With no other candidate branch available, this must throw a single
    // clear error rather than returning 'main' (which would fail to check
    // out) or silently proceeding.
    assert.throws(
      () =>
        findBranchToCheckoutAfterDelete(
          branch('featurebranch1'),
          branch('featurebranch1'),
          branch('main'),
          [branch('featurebranch1'), branch('main')],
          worktrees,
          '/repo'
        ),
      /already checked out in another worktree/
    )
  })

  it('falls back to the most recent branch not used by another worktree', () => {
    const worktrees = [
      worktree('/repo', 'refs/heads/featurebranch1', 'main'),
      worktree('/repo-worktree2', 'refs/heads/main'),
    ]

    const result = findBranchToCheckoutAfterDelete(
      branch('featurebranch1'),
      branch('featurebranch1'),
      branch('main'),
      [branch('main'), branch('featurebranch3')],
      worktrees,
      '/repo'
    )

    assert.strictEqual(result?.name, 'featurebranch3')
  })

  it('throws a clear, worktree-specific error when every candidate branch is in use elsewhere', () => {
    const worktrees = [
      worktree('/repo', 'refs/heads/featurebranch1', 'main'),
      worktree('/repo-worktree2', 'refs/heads/main'),
    ]

    assert.throws(
      () =>
        findBranchToCheckoutAfterDelete(
          branch('featurebranch1'),
          branch('featurebranch1'),
          branch('main'),
          [branch('main')],
          worktrees,
          '/repo'
        ),
      /already checked out in another worktree/
    )
  })

  it('throws the original error when there is no other branch at all', () => {
    assert.throws(
      () =>
        findBranchToCheckoutAfterDelete(
          branch('main'),
          branch('main'),
          null,
          [],
          [worktree('/repo', 'refs/heads/main', 'main')],
          '/repo'
        ),
      /not possible to delete the only existing branch/
    )
  })

  it('excludes the current worktree itself from the "used elsewhere" check', () => {
    // Only worktree entry is the current one - its own branch assignment
    // must not block picking the default branch as a fallback.
    const result = findBranchToCheckoutAfterDelete(
      branch('featurebranch1'),
      branch('featurebranch1'),
      branch('main'),
      [],
      [worktree('/repo', 'refs/heads/featurebranch1', 'main')],
      '/repo'
    )
    assert.strictEqual(result?.name, 'main')
  })
})
