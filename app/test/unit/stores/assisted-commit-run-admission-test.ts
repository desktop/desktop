import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  count,
  indexPath,
  optionalBytes,
  seed,
} from '../../helpers/assisted-commit'
import {
  deferred,
  makeCopilotAccount,
  splitResponse,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { PopupType } from '../../../src/models/popup'
import { AssistedCommitError } from '../../../src/lib/git/assisted-commit'
import { git } from '../../../src/lib/git/core'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { AccountRequiresSignInError } from '../../../src/lib/credential-sessions'
import { Account } from '../../../src/models/account'
import {
  isRepositoryGitPaused,
  withRepositoryGitOperation,
} from '../../../src/lib/git/repository-operation'

describe('AppStore assisted commit consent and admission', () => {
  function awaitPopup(
    h: Awaited<ReturnType<typeof createAssistedCommitRunHarness>>,
    type: PopupType
  ) {
    const ready = deferred<void>()
    const subscription = h.appStore.onDidUpdate(() => {
      if (h.appStore['popupManager'].areTherePopupsOfType(type)) {
        ready.resolve()
      }
    })
    return { promise: ready.promise, subscription }
  }

  it('blocks duplicate and competing backend actions while analysis is pending', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const analyzing = deferred<void>()
    const stop = deferred<void>()
    h.propose.mock.mockImplementation(
      async (_account, analysis, _path, options) => {
        analyzing.resolve()
        await stop.promise
        if (options?.signal?.aborted) {
          throw new AssistedCommitError(
            'cancelled',
            'Cancelled synthetic analysis'
          )
        }
        return splitResponse(analysis)
      }
    )
    const run = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'busy'
    )
    assert.throws(
      () => h.dispatcher.setCommitMode(repository, 'manual'),
      /assisted commit run/
    )
    assert.throws(
      () =>
        h.dispatcher.updateCommitOptions(repository, {
          allowEmptyCommit: true,
        }),
      /assisted commit run/
    )
    await assert.rejects(
      h.appStore._discardChanges(
        repository,
        h.request(repository).files,
        false
      ),
      /assisted commit run/
    )
    const commit = h.state(repository).commitLookup.values().next().value
    assert.ok(commit)
    await assert.rejects(
      h.appStore._undoCommit(repository, commit, false),
      /assisted commit run/
    )
    h.cancel(repository)
    stop.resolve()
    assert.strictEqual((await run).kind, 'cancelled')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('accepts assisted-specific consent, then performs the correct action without ordinary message generation', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.dialogs['lastConsent'] = null
    const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
    t.after(() => popupReady.subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await popupReady.promise
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'awaiting-consent'
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
    assert.strictEqual(await count(repository), 1)
    const popup = h.appStore['popupManager'].currentPopup
    assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
    popup.onAccepted()
    const result = await operation
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      h.appStore['commitMessageGenerationDisclaimerLastSeen'],
      null
    )
    assert.ok(h.assisted.dialogs['lastConsent'] !== null)
  })

  for (const action of [
    'decline',
    'cancel',
    'stale-selection',
    'stale-options',
  ] as const) {
    it(`starts nothing when assisted consent is ${action}`, async t => {
      const source = await seed(t, { 'one.txt': 'one\n', 'two.txt': 'two\n' })
      await writeFile(join(source.path, 'one.txt'), 'ONE\n')
      await writeFile(join(source.path, 'two.txt'), 'TWO\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.assisted.dialogs['lastConsent'] = null
      const originalIndex = await optionalBytes(await indexPath(repository))
      const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
      t.after(() => popupReady.subscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      await popupReady.promise
      const popup = h.appStore['popupManager'].currentPopup
      assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
      if (action === 'decline') {
        assert.ok(popup.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      } else if (action === 'cancel') {
        h.cancel(repository)
      } else {
        if (action === 'stale-selection') {
          h.stores.repositoryStateCache.updateChangesState(
            repository,
            state => ({
              workingDirectory:
                state.workingDirectory.withIncludeAllFiles(false),
            })
          )
        } else {
          h.stores.repositoryStateCache.update(repository, () => ({
            signOffCommits: true,
          }))
        }

        popup.onAccepted()
      }
      const result = await operation
      assert.strictEqual(
        result.kind,
        action === 'decline'
          ? 'declined'
          : action === 'cancel'
          ? 'cancelled'
          : 'error'
      )
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(
        await optionalBytes(await indexPath(repository)),
        originalIndex
      )
      assert.strictEqual(h.state(repository).isCommitting, false)
    })
  }

  it('rejects selected content changed while consent is open without capturing or analyzing it', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.dialogs['lastConsent'] = null
    const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
    t.after(() => popupReady.subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await popupReady.promise
    await writeFile(join(repository.path, 'file'), 'new user content\n')
    const popup = h.appStore['popupManager'].currentPopup
    assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
    popup.onAccepted()
    const result = await operation
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'file'), 'utf8'),
      'new user content\n'
    )
  })

  it('keeps consent fresh for 30 days but never shares manual-generation consent', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.dialogs['lastConsent'] = Date.now() - 29 * 24 * 60 * 60 * 1000
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    await writeFile(join(source.path, 'file.txt'), 'again\n')
    await h.appStore._loadStatus(repository)
    h.assisted.dialogs['lastConsent'] = Date.now() - 31 * 24 * 60 * 60 * 1000
    h.appStore['commitMessageGenerationDisclaimerLastSeen'] = Date.now()
    const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
    t.after(() => popupReady.subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await popupReady.promise
    h.cancel(repository)
    assert.strictEqual((await operation).kind, 'cancelled')
  })

  it('rejects an in-flight index writer before admission and captures only after it settles', async t => {
    const source = await seed(t, { selected: 'before\n', other: 'before\n' })
    await writeFile(join(source.path, 'selected'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    const writer = withRepositoryGitOperation(
      repository.path,
      'mutation',
      async () => {
        entered.resolve()
        await finish.promise
        await git(['add', '--', 'selected'], repository.path, 'existing-stage')
      }
    )
    await entered.promise
    const run = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual((await run).kind, 'busy')
    finish.resolve()
    await writer
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
  })

  for (const change of ['sign-out', 'disabled', 'token'] as const) {
    it(`stops active analysis when authorization becomes ${change}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        const account = makeCopilotAccount()
        if (change === 'token') {
          await h.stores.accountsStore.addAccount(
            h.appStore['accounts'][0].withToken('changed-token')
          )
        } else {
          h.appStore['accounts'] =
            change === 'sign-out'
              ? []
              : [
                  new Account(
                    account.login,
                    account.endpoint,
                    account.token,
                    account.emails,
                    account.avatarURL,
                    account.id,
                    account.name,
                    account.plan,
                    account.copilotEndpoint,
                    false,
                    account.features,
                    account.copilotLicenseType
                  ),
                ]
        }
        h.assisted.context['abortUnauthorized']()
        return wholeSelectionResponse(analysis)
      })
      const result = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(result.kind, 'error')
      if (result.kind === 'error') {
        if (change === 'token') {
          assert.ok(
            assistedCommitErrorCauses(result.error).some(
              error => error instanceof AccountRequiresSignInError
            )
          )
        } else {
          assert.match(result.error.message, /Copilot access changed/)
        }
      }
      assert.strictEqual(await count(repository), 1)
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(h.commits.mock.callCount(), 0)
    })
  }

  it('gates unavailable runtime before consent, capture or analysis', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.runtime.mock.mockImplementation(async () => false)
    h.assisted.dialogs['lastConsent'] = null
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
    assert.strictEqual(h.appStore['popupManager'].currentPopup, null)
  })
})
