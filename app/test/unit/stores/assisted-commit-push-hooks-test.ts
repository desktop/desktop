import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import type { CopyOptions } from 'fs'
import * as Dugite from 'dugite'
import { basename, join } from 'path'
import { getProxyCommandPath } from 'process-proxy'
import type { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'

let harness: typeof import('../../helpers/assisted-commit-run')
let fixtures: typeof import('../../helpers/assisted-commit')
let remotes: typeof import('../../helpers/assisted-commit-push')
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
  ;[harness, fixtures, remotes, models, hooks, popupTypes] = await Promise.all([
    import('../../helpers/assisted-commit-run'),
    import('../../helpers/assisted-commit'),
    import('../../helpers/assisted-commit-push'),
    import('../../helpers/copilot-assisted-commit'),
    import('../../../src/lib/hooks/config'),
    import('../../../src/models/popup'),
  ])
})

function resolveHookPopups(
  h: Awaited<ReturnType<typeof createAssistedCommitRunHarness>>,
  action: 'abort' | 'ignore'
) {
  const handled = new Set<number>()
  return h.appStore.onDidUpdate(() => {
    const popup = h.appStore['popupManager'].currentPopup
    if (
      popup?.type === popupTypes.PopupType.HookFailed &&
      popup.id !== undefined &&
      !handled.has(popup.id)
    ) {
      handled.add(popup.id)
      popup.resolve(action)
    }
  })
}

describe('assisted push with native hook interception', () => {
  it('preserves the configured remote name and exact frozen ref update in native pre-push input', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    hooks.setHooksEnvEnabled(true)
    await fixtures.writeHook(
      repository,
      'pre-push',
      'printf "%s\\n" "$1" > hook-remote-name\nprintf "%s\\n" "$2" > hook-remote-url\ncat > hook-update\nexit 0'
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    const fullTip = await fixtures.tip(repository)
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'hook-remote-name'), 'utf8'),
      'origin\n'
    )
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'hook-remote-url'), 'utf8'),
      `${remote.path}\n`
    )
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'hook-update'), 'utf8'),
      `${fullTip} ${fullTip} ${remote.remoteRef} ${remote.originalTip}\n`
    )
    assert.strictEqual(await remote.tip(), fullTip)
  })

  for (const action of ['abort', 'ignore'] as const) {
    it(`${action} joins the actual native pre-push outcome, keeping all planned local commits`, async t => {
      const source = await fixtures.seed(t, { one: 'one\n', two: 'two\n' })
      const remote = await remotes.addBareRemote(t, source)
      await FileSystem.writeFile(join(source.path, 'one'), 'ONE\n')
      await FileSystem.writeFile(join(source.path, 'two'), 'TWO\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      hooks.setHooksEnvEnabled(true)
      await fixtures.writeHook(
        repository,
        'pre-push',
        'echo "native rejecting pre-push" >&2\nexit 1'
      )
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.propose.mock.mockImplementation(async (_account, analysis) =>
        models.splitResponse(analysis)
      )
      const subscription = resolveHookPopups(h, action)
      t.after(() => subscription.dispose())
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(
        outcome.kind,
        action === 'ignore' ? 'pushed' : 'push-error'
      )
      assert.strictEqual(await fixtures.count(repository), 3)
      assert.strictEqual(
        await remote.tip(),
        action === 'ignore'
          ? await fixtures.tip(repository)
          : remote.originalTip
      )
      assert.strictEqual(h.propose.mock.callCount(), 1)
      assert.strictEqual(h.commits.mock.callCount(), 2)
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(h.state(repository).isPushPullFetchInProgress, false)
      assert.strictEqual(h.state(repository).hookProgress, null)
      assert.strictEqual(
        h.appStore['popupManager'].areTherePopupsOfType(
          popupTypes.PopupType.HookFailed
        ),
        false
      )
      assert.strictEqual(
        h.appStore['assistedCommitRuns'].get(repository.id)?.recoveryCapability,
        undefined
      )
    })
  }

  it('reruns push hooks on retry without inheriting commit-hook bypass, options resets, or AI eligibility', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    hooks.setHooksEnvEnabled(true)
    await fixtures.writeHook(
      repository,
      'pre-commit',
      'echo "commit hook must be bypassed" >&2\nexit 1'
    )
    await fixtures.writeHook(
      repository,
      'pre-push',
      'n=0; if test -f hook-count; then n=$(cat hook-count); fi\nn=$((n + 1)); printf "%s" "$n" > hook-count\necho "push hook must run" >&2\nexit 1'
    )
    h.dispatcher.updateCommitOptions(repository, { skipCommitHooks: true })
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let subscription = resolveHookPopups(h, 'abort')
    t.after(() => subscription.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    const fullTip = await fixtures.tip(repository)
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'hook-count'), 'utf8'),
      '1'
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    subscription.dispose()
    subscription = resolveHookPopups(h, 'ignore')
    h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
    h.appStore['accounts'] = []
    h.runtime.mock.mockImplementation(async () => false)
    const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
      repository,
      state.runId
    )
    assert.ok(retry?.kind === 'pushed')
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'hook-count'), 'utf8'),
      '2'
    )
    assert.strictEqual(await fixtures.tip(repository), fullTip)
    assert.strictEqual(await remote.tip(), fullTip)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(h.state(repository).allowEmptyCommit, true)
    assert.strictEqual(h.state(repository).skipCommitHooks, true)
  })

  it('native hook abort after push entry joins the killed process and never rolls history back', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    hooks.setHooksEnvEnabled(true)
    await fixtures.writeHook(repository, 'pre-push', 'sleep 10\nexit 0')
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const subscription = h.appStore.onDidUpdate(() => {
      const state = h.state(repository)
      if (
        state.changesState.assistedCommit.kind === 'pushing' &&
        state.hookProgress?.status === 'started'
      ) {
        h.cancel(repository)
        state.hookProgress.abort()
      }
    })
    t.after(() => subscription.dispose())
    const abort = resolveHookPopups(h, 'abort')
    t.after(() => abort.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, true)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(h.state(repository).isPushPullFetchInProgress, false)
    assert.strictEqual(
      h.appStore['popupManager'].areTherePopupsOfType(
        popupTypes.PopupType.HookFailed
      ),
      false
    )
  })
})
