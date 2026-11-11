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
  ;[harness, fixtures, remotes, hooks, popupTypes] = await Promise.all([
    import('../../helpers/assisted-commit-run'),
    import('../../helpers/assisted-commit'),
    import('../../helpers/assisted-commit-push'),
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

describe('ordinary auto-push with native hook interception', () => {
  for (const mode of ['manual', 'copilot'] as const) {
    for (const phase of ['pre-commit', 'pre-push'] as const) {
      for (const action of ['abort', 'ignore'] as const) {
        it(`${mode} commit honors intercepted ${phase} ${action} without confusing local and push success`, async t => {
          const source = await fixtures.seed(t, { file: 'before\n' })
          const remote = await remotes.addBareRemote(t, source)
          await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
          const h = await harness.createAssistedCommitRunHarness(t)
          const repository = await h.register(source)
          h.dispatcher.setCommitMode(repository, mode)
          h.dispatcher.setPushAfterCommit(repository, true)
          hooks.setHooksEnvEnabled(true)
          await fixtures.writeHook(
            source,
            phase,
            'echo "synthetic hook refusal" >&2\nexit 1'
          )
          const errors: Error[] = []
          h.appStore.onDidError(error => errors.push(error))
          const refresh = t.mock.method(h.appStore, '_refreshRepository')
          const publication = t.mock.fn(
            h.appStore['pushAfterCommit'].bind(h.appStore)
          )
          h.appStore['pushAfterCommit'] = publication
          const subscription = resolveHookPopups(h, action)
          t.after(() => subscription.dispose())
          const outcome =
            mode === 'manual'
              ? await h.dispatcher.commitIncludedChanges(repository, {
                  summary: 'Manual commit with hooks',
                  description: '',
                })
              : await h.dispatcher.createCopilotAssistedCommits(
                  repository,
                  h.request(repository)
                )
          await Promise.all(publication.mock.calls.map(call => call.result))
          await Promise.all(refresh.mock.calls.map(call => call.result))
          const committed = phase === 'pre-push' || action === 'ignore'
          assert.strictEqual(
            mode === 'manual'
              ? outcome
              : typeof outcome === 'object' && outcome.kind === 'local-ready',
            committed
          )
          assert.strictEqual(await fixtures.count(source), committed ? 2 : 1)
          assert.strictEqual(
            await remote.tip(),
            action === 'ignore'
              ? await fixtures.tip(source)
              : remote.originalTip
          )
          assert.strictEqual(errors.length, 0)
          assert.strictEqual(h.commits.mock.callCount(), committed ? 1 : 0)
          assert.strictEqual(
            h.propose.mock.callCount(),
            mode === 'manual' ? 0 : 1
          )
          assert.strictEqual(h.state(repository).hookProgress, null)
          assert.strictEqual(h.state(repository).isCommitting, false)
        })
      }
    }
  }
})
