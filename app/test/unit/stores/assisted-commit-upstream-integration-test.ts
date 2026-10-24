import assert from 'node:assert/strict'
import { describe, it, TestContext } from 'node:test'
import { access, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import { AccountRequiresSignInError } from '../../../src/lib/credential-sessions'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { isRepositoryGitMutationInProgress } from '../../../src/lib/git/repository-operation'
import { TipState } from '../../../src/models/tip'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { count, rawGit, seed } from '../../helpers/assisted-commit'
import {
  deferred,
  splitResponse,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { AsyncInMemoryStore, InMemoryStore } from '../../helpers/stores'
import { createTempDirectory } from '../../helpers/temp'

async function credentialHarness(t: TestContext) {
  let now = Date.now()
  let renewals = 0
  const accountsStore = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore(),
    async () => {
      renewals++
      return {
        accessToken: `rotated-access-${renewals}`,
        refreshToken: `rotated-refresh-${renewals}`,
        expiresAt: now + 8 * 60 * 60_000,
      }
    },
    () => now
  )
  const h = await createAssistedCommitRunHarness(t, accountsStore)
  h.appStore['updateCopilotModelsForCurrentAccount'] = () => {}
  h.appStore['updateCopilotQuotaSnapshotsForCurrentAccount'] = () => {}
  h.appStore['refreshSelectedRepositoryAfterAccountChange'] = async () => {}
  const original = h.appStore['accounts'][0]
  const account = await accountsStore.addAccount(original, {
    accessToken: original.token,
    refreshToken: 'synthetic-refresh',
    expiresAt: now + 8 * 60 * 60_000,
  })
  assert.ok(account)
  const rotate = async () => {
    now += 8 * 60 * 60_000
    return accountsStore.getAccountWithFreshToken(account)
  }
  return { ...h, account, accountsStore, rotate, renewals: () => renewals }
}

describe('assisted runs on upstream credential and worktree APIs', () => {
  for (const phase of ['first-click', 'analysis'] as const) {
    it(`follows the issuing session through token rotation during ${phase}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected after\n')
      const h = await credentialHarness(t)
      const repository = await h.register(source)
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      if (phase === 'first-click') {
        await h.rotate()
      } else {
        h.propose.mock.mockImplementation(async (original, analysis) => {
          assert.strictEqual(original, h.account)
          await h.rotate()
          return wholeSelectionResponse(analysis)
        })
      }
      const result = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.equal(result.kind, 'local-ready')
      assert.equal(h.renewals(), 1)
      assert.equal(h.appStore['accounts'][0].token, 'rotated-access-1')
      assert.equal(h.propose.mock.callCount(), 1)
      assert.equal(await count(repository), 2)
      assert.equal(h.state(repository).changesState.assistedCommit.kind, 'idle')
    })
  }

  for (const change of ['rotation', 'replacement'] as const) {
    it(`preserves exact transaction ownership on credential ${change} after an earlier commit`, async t => {
      const source = await seed(t, { one: 'before one\n', two: 'before two\n' })
      await writeFile(join(source.path, 'one'), 'selected one\n')
      await writeFile(join(source.path, 'two'), 'selected two\n')
      const h = await credentialHarness(t)
      const repository = await h.register(source)
      h.propose.mock.mockImplementation(async (_account, analysis) =>
        splitResponse(analysis)
      )
      const originalHead = await rawGit(repository, ['rev-parse', 'HEAD'])
      const onProgress = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
      let changed = false
      h.appStore['onAssistedCommitProgress'] = async (run, progress) => {
        onProgress(run, progress)
        if (progress.kind === 'committing' && progress.index === 1) {
          assert.equal(await count(repository), 2)
          changed = true
          if (change === 'rotation') {
            await h.rotate()
          } else {
            await h.accountsStore.addAccount(h.account)
          }
        }
      }
      const result = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.equal(changed, true)
      assert.equal(result.kind, change === 'rotation' ? 'local-ready' : 'error')
      assert.equal(await count(repository), change === 'rotation' ? 3 : 1)
      if (change === 'replacement') {
        assert.equal(
          await rawGit(repository, ['rev-parse', 'HEAD']),
          originalHead
        )
      }
      assert.equal(
        await readFile(join(repository.path, 'one'), 'utf8'),
        'selected one\n'
      )
      assert.equal(
        await readFile(join(repository.path, 'two'), 'utf8'),
        'selected two\n'
      )
    })
  }

  for (const phase of ['first-click', 'analysis'] as const) {
    it(`rejects a replacement sign-in reusing the same access token during ${phase}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected after\n')
      const h = await credentialHarness(t)
      const repository = await h.register(source)
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      const replace = async () => {
        const next = await h.accountsStore.addAccount(h.account, {
          accessToken: h.account.token,
          refreshToken: 'replacement-refresh',
          expiresAt: Date.now() + 8 * 60 * 60_000,
        })
        assert.ok(next)
        assert.notStrictEqual(next, h.account)
      }
      if (phase === 'first-click') {
        await replace()
      } else {
        h.propose.mock.mockImplementation(async (_account, analysis) => {
          await replace()
          return wholeSelectionResponse(analysis)
        })
      }
      const result = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.equal(result.kind, 'error')
      if (result.kind === 'error') {
        assert.ok(
          assistedCommitErrorCauses(result.error).some(
            error => error instanceof AccountRequiresSignInError
          )
        )
      }
      assert.equal(await count(repository), 1)
      assert.equal(h.commits.mock.callCount(), 0)
      assert.equal(h.propose.mock.callCount(), phase === 'first-click' ? 0 : 1)
    })
  }

  it('creates Empty commit without looking up or acquiring any credential', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
    const bind = t.mock.method(
      h.stores.accountsStore,
      'createTokenGetter',
      () => {
        throw new Error('Empty commits must not look up credentials')
      }
    )
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.equal(result.kind, 'local-ready')
    assert.equal(bind.mock.callCount(), 0)
    assert.equal(h.propose.mock.callCount(), 0)
    assert.equal(
      await rawGit(repository, ['log', '-1', '--format=%s']),
      'Empty commit'
    )
  })

  it('retains worktree-removal admission until deferred upstream checkout settles', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const tip = h.state(repository).branchesState.tip
    assert.equal(tip.kind, TipState.Valid)
    if (tip.kind !== TipState.Valid) {
      throw new Error('Expected a branch for deferred checkout')
    }
    const entered = deferred<void>()
    const finish = deferred<void>()
    t.after(() => finish.resolve())
    h.appStore['_refreshWorktrees'] = async () => {}
    h.appStore['_checkoutBranch'] = async () => {
      entered.resolve()
      await finish.promise
      return repository
    }
    let settled = false
    const removal = h.appStore
      ._deleteWorktree(repository, join(repository.path, 'missing-worktree'), {
        isMissing: true,
        checkout: { branch: tip.branch },
      })
      .then(() => {
        settled = true
      })
    await entered.promise
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(settled, false)
    assert.equal(isRepositoryGitMutationInProgress(repository.path), true)
    assert.equal(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'busy'
    )
    finish.resolve()
    await removal
    assert.equal(isRepositoryGitMutationInProgress(repository.path), false)
  })

  it('forwards force through guarded native worktree removal', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const worktree = join(await createTempDirectory(t), 'linked')
    await rawGit(repository, [
      'worktree',
      'add',
      '-b',
      'linked',
      '--',
      worktree,
    ])
    await writeFile(join(worktree, 'file'), 'uncommitted linked change\n')
    await h.appStore._deleteWorktree(repository, worktree, { force: true })
    await assert.rejects(access(worktree), { code: 'ENOENT' })
    assert.ok(
      !(await rawGit(repository, ['worktree', 'list', '--porcelain'])).includes(
        worktree
      )
    )
    assert.equal(isRepositoryGitMutationInProgress(repository.path), false)
  })
})
