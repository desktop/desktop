import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import type { CopyOptions } from 'fs'
import * as Dugite from 'dugite'
import { basename, join } from 'path'
import { getProxyCommandPath } from 'process-proxy'
import type { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'
import { DiffType } from '../../../src/models/diff'

let harness: typeof import('../../helpers/assisted-commit-run')
let fixtures: typeof import('../../helpers/assisted-commit')
let models: typeof import('../../helpers/copilot-assisted-commit')
let hooks: typeof import('../../../src/lib/hooks/config')
let popupTypes: typeof import('../../../src/models/popup')

before(async () => {
  const copy = FileSystem.cp
  const resolveBinary = Dugite.resolveGitBinary
  const resolveExecPath = Dugite.resolveGitExecPath
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      cp: (source: string, destination: string, options?: CopyOptions) =>
        copy(
          ['process-proxy', 'process-proxy.exe'].includes(basename(source))
            ? getProxyCommandPath()
            : source,
          destination,
          options
        ),
    },
  })
  mock.module('dugite', {
    namedExports: { ...Dugite, resolveGitBinary: () => resolveBinary() },
  })
  mock.module('../../../src/lib/hooks/get-shell-env.ts', {
    namedExports: {
      getShellEnv: async () => ({
        kind: 'success',
        env: { ...process.env, GIT_EXEC_PATH: resolveExecPath() },
      }),
    },
  })
  ;[harness, fixtures, models, hooks, popupTypes] = await Promise.all([
    import('../../helpers/assisted-commit-run'),
    import('../../helpers/assisted-commit'),
    import('../../helpers/copilot-assisted-commit'),
    import('../../../src/lib/hooks/config'),
    import('../../../src/models/popup'),
  ])
})

function resolveHookPopups(
  h: Awaited<ReturnType<typeof createAssistedCommitRunHarness>>,
  action: (index: number) => 'abort' | 'ignore' | 'cancel'
) {
  const handled = new Set<number>()
  return h.appStore.onDidUpdate(() => {
    const popup = h.appStore['popupManager'].currentPopup
    if (
      popup?.type !== popupTypes.PopupType.HookFailed ||
      popup.id === undefined ||
      handled.has(popup.id)
    ) {
      return
    }
    const index = handled.size
    handled.add(popup.id)
    const resolution = action(index)
    if (resolution === 'cancel') {
      h.cancel(
        h.appStore['assistedCommitRuns'].values().next().value!.repository
      )
    } else {
      popup.resolve(resolution)
    }
  })
}

describe('AppStore assisted runs with real hook interception', () => {
  for (const action of ['ignore', 'decline', 'cancel'] as const) {
    it(`${action} settles the native hook failure and never skips later hooks or leaves run commits behind`, async t => {
      const source = await fixtures.seed(t, { one: 'one\n', two: 'two\n' })
      await FileSystem.writeFile(join(source.path, 'one'), 'ONE\n')
      await FileSystem.writeFile(join(source.path, 'two'), 'TWO\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      hooks.setHooksEnvEnabled(true)
      const originalHead = await fixtures.tip(repository)
      const originalIndex = await fixtures.optionalBytes(
        await fixtures.indexPath(repository)
      )
      await fixtures.writeHook(
        repository,
        'pre-commit',
        'n=0; if test -f hook-count; then n=$(cat hook-count); fi\nn=$((n + 1)); printf "%s" "$n" > hook-count\necho "failure $n" >&2\nexit 1'
      )
      h.propose.mock.mockImplementation(async (_account, analysis) =>
        models.splitResponse(analysis)
      )
      const subscription = resolveHookPopups(h, index =>
        action === 'ignore' || index === 0
          ? 'ignore'
          : action === 'decline'
          ? 'abort'
          : 'cancel'
      )
      t.after(() => subscription.dispose())
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(
        await FileSystem.readFile(join(repository.path, 'hook-count'), 'utf8'),
        '2'
      )
      assert.strictEqual(
        h.appStore['popupManager'].areTherePopupsOfType(
          popupTypes.PopupType.HookFailed
        ),
        false
      )
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(h.state(repository).hookProgress, null)
      assert.strictEqual(
        outcome.kind,
        action === 'ignore'
          ? 'local-ready'
          : action === 'cancel'
          ? 'cancelled'
          : 'error'
      )
      if (action === 'ignore') {
        assert.strictEqual(await fixtures.count(repository), 3)
        assert.strictEqual(h.commits.mock.callCount(), 2)
      } else {
        assert.strictEqual(await fixtures.tip(repository), originalHead)
        assert.deepStrictEqual(
          await fixtures.optionalBytes(await fixtures.indexPath(repository)),
          originalIndex
        )
        assert.strictEqual(h.commits.mock.callCount(), 0)
      }
    })
  }

  it('bypasses a rejecting hook only when the frozen skip-hooks option is selected', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    hooks.setHooksEnvEnabled(true)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo must-not-run > rejected\nexit 1'
    )
    h.dispatcher.updateCommitOptions(repository, { skipCommitHooks: true })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.strictEqual(
      await fixtures.optionalBytes(join(repository.path, 'rejected')),
      null
    )
  })

  it('Cancel while a hook is running waits for Git, restores history, and never aborts a later run', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    hooks.setHooksEnvEnabled(true)
    const original = await fixtures.tip(repository)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo entered > entered\nsleep 30'
    )
    const subscription = h.appStore.onDidUpdate(() => {
      if (h.state(repository).hookProgress?.status === 'started') {
        h.cancel(repository)
      }
    })
    const first = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    subscription.dispose()
    assert.strictEqual(first.kind, 'cancelled')
    assert.strictEqual(await fixtures.tip(repository), original)
    await fixtures.writeHook(repository, 'pre-commit', 'exit 0')
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.strictEqual(await fixtures.count(repository), 2)
  })

  it('never changes the fixed Empty commit title through a hook and retains allow-empty on failure', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    hooks.setHooksEnvEnabled(true)
    h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
    const original = await fixtures.tip(repository)
    await fixtures.writeHook(
      repository,
      'commit-msg',
      'printf "Hook changed title\\n" > "$1"'
    )
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.strictEqual(h.state(repository).allowEmptyCommit, true)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('checks actual native committer-email rules after a hook changes the private commit', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await FileSystem.writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const local = await h.register(source)
    const github = new GitHubRepository(
      'synthetic',
      new Owner('synthetic-owner', 'https://api.github.com', 99),
      123,
      false,
      'https://github.com/synthetic-owner/synthetic'
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
    await h.appStore._loadStatus(repository)
    const rules = new RepoRulesInfo()
    rules.committerEmailPatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'rejects hook committer',
      matcher: value => !value.includes('hook-committer@example.invalid'),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    hooks.setHooksEnvEnabled(true)
    await fixtures.writeHook(
      repository,
      'post-commit',
      'GIT_COMMITTER_EMAIL=hook-committer@example.invalid git -c core.hooksPath=/dev/null -c commit.gpgsign=false commit --amend --no-edit --no-verify'
    )
    const original = await fixtures.tip(repository)
    const index = await fixtures.optionalBytes(
      await fixtures.indexPath(repository)
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    if (outcome.kind === 'error') {
      assert.match(outcome.error.message, /committer/)
    }
    assert.strictEqual(await fixtures.tip(repository), original)
    assert.deepStrictEqual(
      await fixtures.optionalBytes(await fixtures.indexPath(repository)),
      index
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('does not invalidate restored partial masks while a successful Manual post-commit hook is still running', async t => {
    const { getWorkingDirectoryDiff } = await import(
      '../../../src/lib/git/diff'
    )
    const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`)
    const source = await fixtures.seed(t, { file: base.join('') })
    const current = [...base]
    current[3] = 'selected prefix\n'
    current[49] = 'unselected suffix\n'
    await FileSystem.writeFile(join(source.path, 'file'), current.join(''))
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text && diff.hunks.length === 2)
    let selection = file.selection
    for (const [index, line] of diff.hunks[1].lines.entries()) {
      if (line.isIncludeableLine()) {
        selection = selection.withLineSelection(
          diff.hunks[1].unifiedDiffStart + index,
          false
        )
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'cancelled'
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    hooks.setHooksEnvEnabled(true)
    await fixtures.writeHook(repository, 'post-commit', 'sleep 1')
    const entered = models.deferred<void>()
    const errors: Error[] = []
    const subscription = h.appStore.onDidUpdate(() => {
      const progress = h.state(repository).hookProgress
      if (
        progress?.hookName === 'post-commit' &&
        progress.status === 'started'
      ) {
        entered.resolve()
      }
    })
    const errorSubscription = h.appStore.onDidError(error => errors.push(error))
    t.after(() => {
      subscription.dispose()
      errorSubscription.dispose()
    })
    const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(h.appStore)
    let refreshed: Promise<void> | undefined
    h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
      refreshed = refresh(...args)
      return refreshed
    }
    const committing = h.appStore._commitIncludedChanges(repository, {
      summary: 'Manual partial commit',
      description: '',
      trailers: [],
    })
    await entered.promise
    assert.strictEqual(await fixtures.count(repository), 2)
    const status = h.appStore._loadStatus(repository)
    try {
      assert.strictEqual(await committing, true)
      await status
    } finally {
      await refreshed
    }
    assert.deepStrictEqual(errors, [])
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(h.commits.mock.callCount(), 1)
  })
})
