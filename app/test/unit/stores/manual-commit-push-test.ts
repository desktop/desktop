import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  createAssistedCommitRunHarness,
  partialSelectionFixture,
} from '../../helpers/assisted-commit-run'
import { addBareRemote } from '../../helpers/assisted-commit-push'
import {
  count,
  rawGit,
  seed,
  tip,
  writeHook,
} from '../../helpers/assisted-commit'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { RetryActionType } from '../../../src/models/retry-actions'
import { ICommitContext } from '../../../src/models/commit'
import { Repository } from '../../../src/models/repository'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { getConfigValue } from '../../../src/lib/git/config'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'

async function harness(t: TestContext, source: Repository) {
  const h = await createAssistedCommitRunHarness(t)
  const repository = await h.register(source)
  h.dispatcher.setCommitMode(repository, 'manual')
  const refresh = t.mock.method(h.appStore, '_refreshRepository')
  const errors: Error[] = []
  h.appStore.onDidError(error => errors.push(error))
  const settle = () => Promise.all(refresh.mock.calls.map(call => call.result))
  const commit = async (context: Partial<ICommitContext> = {}) => {
    const success = await h.dispatcher.commitIncludedChanges(repository, {
      summary: 'Manual commit',
      description: '',
      ...context,
    })
    await settle()
    return success
  }
  const retry = () => {
    const error = errors[errors.length - 1]
    assert.ok(error instanceof ErrorWithMetadata)
    const action = error.metadata.retryAction
    assert.ok(action?.type === RetryActionType.Push && action.commit)
    return action
  }
  return { ...h, repository, commit, errors, retry, settle }
}

describe('manual commit automatic push', () => {
  for (const enabled of [false, true]) {
    it(`commits and runs ordinary hooks with shared preference ${enabled}, without model work`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      await writeFile(join(source.path, 'file'), 'after\n')
      await writeHook(source, 'pre-commit', 'echo commit >> commit-hooks')
      await writeHook(source, 'pre-push', 'echo push >> push-hooks')
      const h = await harness(t, source)
      h.dispatcher.setPushAfterCommit(h.repository, enabled)
      h.dispatcher.updateCommitOptions(h.repository, { signOffCommits: true })
      assert.strictEqual(
        await h.commit({
          trailers: [
            { token: 'Co-Authored-By', value: 'Co Author <co@example.com>' },
          ],
        }),
        true
      )
      assert.deepStrictEqual(h.errors, [])
      assert.strictEqual(await count(source), 2)
      assert.strictEqual(
        await remote.tip(),
        enabled ? await tip(source) : remote.originalTip
      )
      assert.strictEqual(
        await readFile(join(source.path, 'commit-hooks'), 'utf8'),
        'commit\n'
      )
      if (enabled) {
        assert.strictEqual(
          await readFile(join(source.path, 'push-hooks'), 'utf8'),
          'push\n'
        )
      } else {
        await assert.rejects(readFile(join(source.path, 'push-hooks')), {
          code: 'ENOENT',
        })
      }
      const message = await rawGit(source, [
        'show',
        '-s',
        '--format=%B',
        'HEAD',
      ])
      assert.match(message, /Co-Authored-By: Co Author <co@example.com>/)
      assert.match(message, /Signed-off-by:/)
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(h.state(h.repository).isCommitting, false)
      assert.strictEqual(h.state(h.repository).isPushPullFetchInProgress, false)
    })
  }

  it('keeps a successful commit, clears its draft/options and retries only push after remote rejection', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const hook = join(remote.path, 'hooks', 'pre-receive')
    await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    h.dispatcher.updateCommitOptions(h.repository, { allowEmptyCommit: true })
    await h.dispatcher.setCommitMessage(h.repository, {
      summary: 'Saved manual draft',
      description: 'Details',
      timestamp: Date.now(),
    })
    assert.strictEqual(await h.commit(), true)
    const committed = await tip(source)
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.errors.length, 1)
    assert.strictEqual(h.state(h.repository).allowEmptyCommit, false)
    assert.strictEqual(
      h.state(h.repository).changesState.commitMessage.summary,
      ''
    )
    assert.deepStrictEqual(
      h.appStore['gitStoreCache'].get(h.repository).commitMessage,
      DefaultCommitMessage
    )
    const retry = h.retry()
    assert.strictEqual(retry.commit?.publication.pushed, false)
    await unlink(hook)
    await h.dispatcher.performRetry(retry)
    await h.settle()
    assert.strictEqual(h.errors.length, 1)
    assert.strictEqual(await remote.tip(), committed)
    assert.strictEqual(await tip(source), committed)
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it('never pushes a failed commit or clears its draft', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    await writeHook(source, 'pre-commit', 'exit 1')
    await writeHook(source, 'pre-push', 'echo push > push-hooks')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    await h.dispatcher.setCommitMessage(h.repository, {
      summary: 'Keep failed draft',
      description: '',
      timestamp: Date.now(),
    })
    assert.strictEqual(await h.commit(), false)
    assert.strictEqual(await count(source), 1)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(
      h.state(h.repository).changesState.commitMessage.summary,
      'Keep failed draft'
    )
    await assert.rejects(readFile(join(source.path, 'push-hooks')), {
      code: 'ENOENT',
    })
  })

  it('keeps local success after a declined pre-push hook and retries without another commit', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    await writeHook(source, 'pre-push', 'exit 1')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    assert.strictEqual(await h.commit(), true)
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    const retry = h.retry()
    await unlink(join(source.path, '.git', 'hooks', 'pre-push'))
    await h.dispatcher.performRetry(retry)
    assert.strictEqual(h.errors.length, 1)
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(await remote.tip(), await tip(source))
  })

  it('publishes the original branch into an existing remote and installs its upstream', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source, { publish: false })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    assert.strictEqual(await h.commit(), true)
    assert.deepStrictEqual(h.errors, [])
    assert.strictEqual(await remote.tip(), await tip(source))
    const branch = remote.branchRef.slice('refs/heads/'.length)
    assert.strictEqual(
      await getConfigValue(source, `branch.${branch}.remote`),
      'origin'
    )
    assert.strictEqual(
      await getConfigValue(source, `branch.${branch}.merge`),
      remote.branchRef
    )
  })

  it('allows an empty manual commit without using Copilot', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    h.dispatcher.updateCommitOptions(h.repository, { allowEmptyCommit: true })
    assert.strictEqual(await h.commit({ summary: 'Manual empty commit' }), true)
    assert.deepStrictEqual(h.errors, [])
    assert.strictEqual(await remote.tip(), await tip(source))
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.state(h.repository).allowEmptyCommit, false)
  })

  it('pushes only selected partial content and keeps unselected working changes', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    const remote = await addBareRemote(t, repository)
    h.dispatcher.setCommitMode(repository, 'manual')
    h.dispatcher.setPushAfterCommit(repository, true)
    const refresh = t.mock.method(h.appStore, '_refreshRepository')
    assert.strictEqual(
      await h.dispatcher.commitIncludedChanges(repository, {
        summary: 'Selected hunk',
        description: '',
      }),
      true
    )
    await Promise.all(refresh.mock.calls.map(call => call.result))
    assert.strictEqual(await remote.tip(), await tip(repository))
    assert.match(
      await rawGit(repository, ['diff', '--', 'file']),
      /selected suffix/
    )
    assert.doesNotMatch(
      await rawGit(repository, ['show', 'HEAD:file']),
      /selected suffix/
    )
  })

  for (const change of ['branch', 'tip', 'remote', 'account'] as const) {
    it(`refuses push-only retry after original ${change} changes`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      const hook = join(remote.path, 'hooks', 'pre-receive')
      await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness(t, source)
      h.dispatcher.setPushAfterCommit(h.repository, true)
      assert.strictEqual(await h.commit(), true)
      const retry = h.retry()
      await unlink(hook)
      if (change === 'branch') {
        await rawGit(source, ['checkout', '-b', 'different'])
      } else if (change === 'tip') {
        await rawGit(source, [
          'commit',
          '--allow-empty',
          '-m',
          'External commit',
        ])
      } else if (change === 'remote') {
        await rawGit(source, ['remote', 'rename', 'origin', 'different'])
      } else {
        // A metadata/account reassignment is visible in the authoritative cache.
        const account = h.appStore['accounts'][0]
        const gh = new GitHubRepository(
          'synthetic',
          new Owner('fixture', account.endpoint, 1),
          1,
          false,
          'https://github.com/fixture/synthetic'
        )
        h.appStore['gitStoreCache'].setRepository(
          new Repository(
            source.path,
            h.repository.id,
            gh,
            false,
            null,
            {},
            false,
            h.repository.gitDir,
            undefined,
            account.login
          )
        )
      }
      const before = await tip(source)
      await h.dispatcher.performRetry(retry)
      assert.strictEqual(h.errors.length, 2)
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(await tip(source), before)
      assert.strictEqual(h.commits.mock.callCount(), 1)
    })
  }

  it('retains the original repository when retrying after switching the UI', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const other = await seed(t, { file: 'other\n' })
    const otherRemote = await addBareRemote(t, other)
    const hook = join(remote.path, 'hooks', 'pre-receive')
    await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness(t, source)
    const otherRepository = await h.register(other)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    assert.strictEqual(await h.commit(), true)
    const retry = h.retry()
    h.appStore['selectedRepository'] = otherRepository
    await unlink(hook)
    await h.dispatcher.performRetry(retry)
    await h.settle()
    assert.strictEqual(h.errors.length, 1)
    assert.strictEqual(await remote.tip(), await tip(source))
    assert.strictEqual(await otherRemote.tip(), otherRemote.originalTip)
    assert.strictEqual(await count(other), 1)
    assert.strictEqual(
      h.state(otherRepository).changesState.pushAfterCommit,
      false
    )
  })

  it('keeps pending tags local even when Git is configured to follow tags', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await rawGit(source, ['tag', '-a', 'local-only', '-m', 'Local tag'])
    await rawGit(source, ['config', 'push.followTags', 'true'])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness(t, source)
    const gitStore = h.appStore['gitStoreCache'].get(h.repository)
    gitStore['addTagToPush']('local-only')
    h.dispatcher.setPushAfterCommit(h.repository, true)
    assert.strictEqual(await h.commit(), true)
    assert.deepStrictEqual(h.errors, [])
    assert.strictEqual(await remote.read(['tag', '--list']), '')
    assert.deepStrictEqual(gitStore.tagsToPush, ['local-only'])
  })

  it('refuses initial publication if a post-commit hook switches branches', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    await writeHook(source, 'post-commit', 'git checkout -b different')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    assert.strictEqual(await h.commit(), true)
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.errors.length, 1)
    assert.match(h.errors[0].message, /original .*changed/)
    assert.strictEqual(
      await rawGit(source, ['symbolic-ref', 'HEAD']),
      'refs/heads/different'
    )
  })

  it('retries refresh after acknowledged push without repeating native push or statistics', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    await writeHook(source, 'pre-push', 'echo push >> push-hooks')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    const stats = t.mock.method(h.statsStore, 'recordPush')
    const protection = h.appStore['refreshBranchProtectionState'].bind(
      h.appStore
    )
    let fail = true
    h.appStore['refreshBranchProtectionState'] = async (
      ...args: Parameters<typeof protection>
    ) => {
      if (fail) {
        fail = false
        throw new Error('Synthetic post-push refresh failure')
      }
      return protection(...args)
    }
    assert.strictEqual(await h.commit(), true)
    assert.strictEqual(await remote.tip(), await tip(source))
    const retry = h.retry()
    assert.strictEqual(retry.commit?.publication.pushed, true)
    await h.dispatcher.performRetry(retry)
    await h.settle()
    assert.strictEqual(h.errors.length, 1)
    assert.strictEqual(
      await readFile(join(source.path, 'push-hooks'), 'utf8'),
      'push\n'
    )
    assert.strictEqual(stats.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 1)
  })

  for (const excluded of [
    'amend',
    'tutorial',
    'merge',
    'cherry-pick',
    'squash',
  ] as const) {
    it(`does not automatically push ${excluded} commits`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness(t, source)
      h.dispatcher.setPushAfterCommit(h.repository, true)
      if (excluded === 'tutorial') {
        Object.defineProperty(h.repository, 'isTutorialRepository', {
          value: true,
        })
      } else if (excluded === 'merge' || excluded === 'cherry-pick') {
        await writeFile(
          join(
            source.path,
            '.git',
            excluded === 'merge' ? 'MERGE_HEAD' : 'CHERRY_PICK_HEAD'
          ),
          `${remote.originalTip}\n`
        )
      } else if (excluded === 'squash') {
        await writeFile(join(source.path, '.git', 'SQUASH_MSG'), 'Squash\n')
      }
      assert.strictEqual(await h.commit({ amend: excluded === 'amend' }), true)
      assert.deepStrictEqual(h.errors, [])
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(h.propose.mock.callCount(), 0)
    })
  }

  it('keeps the commit and explains normal Publish setup when no remote exists', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness(t, source)
    h.dispatcher.setPushAfterCommit(h.repository, true)
    assert.strictEqual(await h.commit(), true)
    assert.strictEqual(await count(source), 2)
    assert.match(h.errors[0].message, /Configure a remote.*Push or Publish/)
    assert.strictEqual(await rawGit(source, ['remote']), '')
  })
})
