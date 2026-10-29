import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { ipcRenderer } from 'electron'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { rawGit, seed } from '../../helpers/assisted-commit'
import { MockIPC } from '../../helpers/mock-ipc'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { TipState } from '../../../src/models/tip'
import { PopupType } from '../../../src/models/popup'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { updateMenuState } from '../../../src/lib/menu-update'
import { acquireAssistedCommitGitLease } from '../../../src/lib/git/repository-operation'
import { AssistedCommitRunState } from '../../../src/models/assisted-commit-run'

async function previewFixture(t: TestContext) {
  const source = await seed(t, { file: 'before\n' })
  const baseName = await rawGit(source, ['symbolic-ref', '--short', 'HEAD'])
  const baseSHA = await rawGit(source, ['rev-parse', 'HEAD'])
  await rawGit(source, ['switch', '-c', 'preview-feature'])
  await writeFile(join(source.path, 'file'), 'committed feature\n')
  await rawGit(source, ['add', '--', 'file'])
  await rawGit(source, ['commit', '-m', 'Existing feature commit'])
  await rawGit(source, [
    'remote',
    'add',
    'origin',
    'https://github.com/fixture/preview.git',
  ])
  await rawGit(source, [
    'update-ref',
    `refs/remotes/origin/${baseName}`,
    baseSHA,
  ])
  await rawGit(source, [
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    `refs/remotes/origin/${baseName}`,
  ])
  const h = await createAssistedCommitRunHarness(t)
  const local = await h.register(source)
  const github = new GitHubRepository(
    'preview',
    new Owner('fixture', 'https://api.github.com', 42),
    42,
    false,
    'https://github.com/fixture/preview'
  )
  const repository = new Repository(
    local.path,
    local.id,
    github,
    false,
    null,
    {},
    false,
    local.gitDir
  )
  const gitStore = h.appStore['gitStoreCache'].get(repository)
  await h.appStore._loadStatus(repository)
  await gitStore.loadRemotes()
  await gitStore.loadBranches()
  h.appStore['selectedRepository'] = repository
  h.appStore['repositories'] = [repository]
  const merge = h.appStore['setupPRMergeTreePromise']
  h.appStore['setupPRMergeTreePromise'] = () => {}
  t.after(() => {
    h.appStore['setupPRMergeTreePromise'] = merge
  })
  const { tip, defaultBranch } = h.state(repository).branchesState
  assert.ok(tip.kind === TipState.Valid && defaultBranch !== null)
  const errors: Error[] = []
  const subscription = h.appStore.onDidError(error => errors.push(error))
  t.after(() => subscription.dispose())
  const read = t.mock.method(gitStore, 'getCommitsBetweenBranches')
  const preview = () =>
    h.appStore['_initializePullRequestPreview'](
      repository,
      defaultBranch,
      tip.branch
    )
  const menuEnabled = (enabled: boolean) => {
    const ipc = new MockIPC()
    const send = t.mock.method(ipcRenderer, 'send', ipc.send.bind(ipc))
    try {
      updateMenuState(
        {
          ...h.appStore.getState(),
          windowState: 'normal',
          showWelcomeFlow: false,
        },
        null
      )
    } finally {
      send.mock.restore()
    }
    const updates = ipc.sends.find(call => call.channel === 'update-menu-state')
      ?.args[0]
    assert.ok(Array.isArray(updates))
    const item: unknown = updates.find(
      entry => entry.id === 'preview-pull-request'
    )
    assert.deepStrictEqual(item, {
      id: 'preview-pull-request',
      state: { enabled },
    })
  }
  return { h, repository, gitStore, preview, menuEnabled, read, errors }
}

describe('assisted commit pull request preview admission', () => {
  const states: ReadonlyArray<AssistedCommitRunState> = [
    { kind: 'analyzing', runId: 'fixture', cancelRequested: false },
    ...(['recovery', 'refresh'] as const).map(retry => ({
      kind: 'error' as const,
      runId: 'fixture',
      error: new ErrorWithMetadata(new Error('Recovery pending'), {}),
      retry,
      selectionNeedsReview: false,
      settling: false,
    })),
  ]
  for (const state of states) {
    const label = state.kind === 'error' ? state.retry : state.kind
    it(`disables native preview while assisted ${label} owns the repository`, async t => {
      const { h, repository, menuEnabled } = await previewFixture(t)
      menuEnabled(true)
      h.stores.repositoryStateCache.updateChangesState(repository, () => ({
        assistedCommit: state,
      }))
      menuEnabled(false)
    })

    it(`ignores stale preview requests while assisted ${label} owns the repository`, async t => {
      const { h, repository, preview, read, errors } = await previewFixture(t)
      h.stores.repositoryStateCache.updateChangesState(repository, () => ({
        assistedCommit: state,
      }))
      await h.dispatcher.startPullRequest(repository)
      await preview()
      assert.strictEqual(read.mock.callCount(), 0)
      assert.deepStrictEqual(errors, [])
      assert.strictEqual(h.state(repository).pullRequestState, null)
      assert.strictEqual(h.appStore.getState().currentPopup, null)
    })
  }

  it('blocks preview for a physical lease even when this repository has idle UI state', async t => {
    const { repository, menuEnabled, preview, read, errors } =
      await previewFixture(t)
    const lease = await acquireAssistedCommitGitLease(repository.path)
    t.after(() => lease.release())
    menuEnabled(false)
    await preview()
    assert.strictEqual(read.mock.callCount(), 0)
    assert.deepStrictEqual(errors, [])
  })

  it('preserves the real preview before and after an assisted lock', async t => {
    const { h, repository, gitStore, preview, menuEnabled, errors } =
      await previewFixture(t)
    menuEnabled(true)
    await preview()
    let state = h.state(repository).pullRequestState
    assert.strictEqual(state?.commitSHAs?.length, 1)
    assert.strictEqual(state?.commitSelection?.changesetData.files.length, 1)
    assert.strictEqual(
      h.appStore.getState().currentPopup?.type,
      PopupType.StartPullRequest
    )
    const file = state?.commitSelection?.file
    assert.ok(file !== undefined && file !== null)
    h.appStore._closePopup()
    const lease = await acquireAssistedCommitGitLease(repository.path)
    try {
      menuEnabled(false)
      await preview()
      const readDiff = t.mock.method(gitStore, 'performFailableOperation')
      await h.dispatcher.changePullRequestFileSelection(repository, file)
      assert.strictEqual(readDiff.mock.callCount(), 0)
      readDiff.mock.restore()
      assert.strictEqual(h.state(repository).pullRequestState, state)
      assert.strictEqual(h.appStore.getState().currentPopup, null)
    } finally {
      lease.release()
    }
    menuEnabled(true)
    await h.dispatcher.startPullRequest(repository)
    state = h.state(repository).pullRequestState
    assert.strictEqual(state?.commitSHAs?.length, 1)
    assert.strictEqual(state?.commitSelection?.changesetData.files.length, 1)
    assert.strictEqual(
      h.appStore.getState().currentPopup?.type,
      PopupType.StartPullRequest
    )
    assert.deepStrictEqual(errors, [])
  })
})
