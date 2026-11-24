import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { addBareRemote } from '../../helpers/assisted-commit-push'
import { rawGit, seed, tip } from '../../helpers/assisted-commit'
import { getCommit } from '../../../src/lib/git/log'
import {
  ForcePushBranchState,
  getCurrentBranchForcePushState,
} from '../../../src/lib/rebase'

/**
 * Amends HEAD so the branch ends up one commit ahead of and one commit behind
 * its upstream. When `pushed` is false, HEAD is a local commit and the
 * upstream has a commit to pull. When it is true, HEAD is the pushed commit.
 */
async function amendDivergedHead(t: TestContext, pushed: boolean) {
  const source = await seed(t, { file: 'initial\n' })
  await addBareRemote(t, source)

  if (!pushed) {
    await writeFile(join(source.path, 'remote'), 'remote\n')
    await rawGit(source, ['add', '--', 'remote'])
    await rawGit(source, ['commit', '-m', 'Remote commit'])
    await rawGit(source, ['push'])
    await rawGit(source, ['reset', '--hard', 'HEAD~1'])
  }

  await writeFile(join(source.path, 'file'), 'commit\n')
  await rawGit(source, ['commit', '-am', 'Commit to amend'])
  if (pushed) {
    await rawGit(source, ['push'])
  }

  const h = await createAssistedCommitRunHarness(t)
  const repository = await h.register(source)
  h.dispatcher.setCommitMode(repository, 'manual')
  await h.appStore._refreshRepository(repository)

  const refreshes = new Array<Promise<void>>()
  const refreshAfterCommit = h.appStore['_refreshRepositoryAfterCommit'].bind(
    h.appStore
  )
  h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
    const refresh = refreshAfterCommit(...args)
    refreshes.push(refresh)
    return refresh
  }

  const head = await getCommit(repository, 'HEAD')
  assert.ok(head !== null)
  const { localCommitSHAs } = h.appStore['gitStoreCache'].get(repository)
  const isLocalCommit = localCommitSHAs.includes(head.sha)
  assert.strictEqual(isLocalCommit, !pushed)

  await h.appStore._startAmendingRepository(
    repository,
    head,
    isLocalCommit,
    true
  )
  await writeFile(join(source.path, 'file'), 'amended\n')
  await h.appStore._loadStatus(repository)
  assert.strictEqual(
    await h.appStore._commitIncludedChanges(repository, {
      summary: 'Amended commit',
      description: '',
      amend: true,
    }),
    true
  )
  await Promise.all(refreshes)
  assert.strictEqual(refreshes.length, 1)
  assert.notStrictEqual(await tip(repository), head.sha)

  const { branchesState, aheadBehind } = h.state(repository)
  assert.deepStrictEqual(aheadBehind, { ahead: 1, behind: 1 })
  return getCurrentBranchForcePushState(branchesState, aheadBehind)
}

describe('amending a commit', () => {
  it('does not recommend a force push when the commit was not pushed', async t => {
    assert.strictEqual(
      await amendDivergedHead(t, false),
      ForcePushBranchState.Available
    )
  })

  it('recommends a force push when the commit was pushed', async t => {
    assert.strictEqual(
      await amendDivergedHead(t, true),
      ForcePushBranchState.Recommended
    )
  })
})
