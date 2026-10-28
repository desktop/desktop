import { it, describe } from 'node:test'
import { seed, count } from '../../helpers/assisted-commit'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { StatsStore } from '../../../src/lib/stats'
import assert from 'node:assert'
import { Repository } from '../../../src/models/repository'
import {
  wholeSelectionResponse,
  deferred,
} from '../../helpers/copilot-assisted-commit'
import { PopupType } from '../../../src/models/popup'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'

describe('AppStore assisted commit completion and notification settlement', () => {
  for (const mode of ['manual', 'assisted'] as const) {
    it(`preserves successful ${mode} completion after the actual statistics database closes`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
      await h.dispatcher.setCommitMessage(repository, {
        summary: 'Saved manual draft',
        description: 'Saved body',
        timestamp: Date.now(),
      })
      const record = StatsStore.prototype.recordCommit.bind(h.statsStore)
      h.commits.mock.mockImplementation(async () => {
        h.statsStore['db'].close()
        try {
          await record()
        } finally {
          await h.statsStore['db'].open()
        }
      })
      const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(
        h.appStore
      )
      let refreshed: Promise<void> | undefined
      h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
        refreshed = refresh(...args)
        return refreshed
      }
      try {
        if (mode === 'manual') {
          h.dispatcher.setCommitMode(repository, 'manual')
          assert.strictEqual(
            await h.appStore._commitIncludedChanges(repository, {
              summary: 'Manual committed title',
              description: '',
              trailers: [],
            }),
            true
          )
        } else {
          const outcome = await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
          assert.strictEqual(outcome.kind, 'local-ready')
        }
      } finally {
        await refreshed
      }
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(h.state(repository).allowEmptyCommit, false)
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(
        h.state(repository).changesState.commitMessage.summary,
        mode === 'manual' ? '' : 'Saved manual draft'
      )
    })
  }

  it('settles ownership after the initial preparing observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    let threw = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !threw &&
        h.state(repository).changesState.assistedCommit.kind === 'preparing'
      ) {
        threw = true
        throw new Error('Synthetic preparing observer failure')
      }
    })
    t.after(() => subscription.dispose())
    await h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .catch(error => error)
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.assisted.state['runs'].get(repository.id)?.finished,
      true
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it('completes mandatory settlement even when teardown error notification throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    let failed = false
    let threw = false
    h.appStore._refreshRepository = async repo => {
      if (h.state(repository).changesState.assistedCommit.kind === 'error') {
        failed = true
        throw new Error('Synthetic teardown failure')
      }
      return refresh(repo)
    }
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        failed &&
        !threw &&
        h.state(repository).changesState.assistedCommit.kind === 'error'
      ) {
        threw = true
        throw new Error('Synthetic teardown observer failure')
      }
    })
    t.after(() => subscription.dispose())
    h.propose.mock.mockImplementation(async () => {
      h.assisted.readers['deferredRefreshes'].set(repository.id, repository)
      throw new Error('Synthetic planner failure')
    })
    await h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .catch(error => error)
    assert.strictEqual(h.state(repository).isCommitting, false)
    const run = h.assisted.state['runs'].get(repository.id)
    assert.ok(run?.finished && run.lease === undefined)
    assert.strictEqual(await count(repository), 1)
  })

  for (const notification of ['accepted', 'settled'] as const) {
    it(`preserves local-ready outcome and accepted statistics when ${notification} notification throws`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      let threw = false
      const subscription = h.appStore.onDidUpdate(() => {
        const state = h.state(repository)
        const run = h.assisted.state['runs'].get(repository.id)
        if (
          !threw &&
          state.changesState.assistedCommit.kind === 'idle' &&
          (notification === 'accepted' ? run?.finalized : !state.isCommitting)
        ) {
          threw = true
          throw new Error('Synthetic post-accept observer failure')
        }
      })
      t.after(() => subscription.dispose())
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(outcome.kind, 'local-ready')
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(h.state(repository).isCommitting, false)
    })
  }

  for (const exit of ['cancel', 'decline', 'error'] as const) {
    for (const notification of ['update', 'history'] as const) {
      it(`returns controlled ${exit} after final ${notification} notification throws`, async t => {
        const source = await seed(t, { file: 'before\n' })
        await writeFile(join(source.path, 'file'), 'selected\n')
        const h = await createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        const originalFailure = new Error('Synthetic planner failure')
        const notificationFailure = new Error(
          'Synthetic settled notification failure'
        )
        const deferHistory = () => {
          if (notification === 'history') {
            h.assisted.readers['deferredHistory'].set(repository.id, repository)
          }
        }
        if (notification === 'history') {
          let settledReaders = false
          const load = h.appStore._loadChangedFilesForCurrentSelection.bind(
            h.appStore
          )
          t.mock.method(
            h.appStore,
            '_loadChangedFilesForCurrentSelection',
            async (repo: Repository) => {
              if (settledReaders) {
                throw new Error('Synthetic settled History failure')
              }
              return load(repo)
            }
          )
          const finish = h.assisted.readers['finish'].bind(h.assisted.readers)
          h.assisted.readers['finish'] = async run => {
            await finish(run)
            settledReaders = true
            deferHistory()
          }
        }
        if (exit === 'decline') {
          h.assisted.dialogs['lastConsent'] = null
        }
        h.propose.mock.mockImplementation(async (_account, analysis) => {
          if (exit === 'error') {
            throw originalFailure
          }
          h.cancel(repository)
          return wholeSelectionResponse(analysis)
        })
        let threw = false
        const subscription =
          notification === 'history'
            ? h.appStore.onDidError(() => {
                threw = true
                throw notificationFailure
              })
            : h.appStore.onDidUpdate(() => {
                const state = h.state(repository)
                const run = h.assisted.state['runs'].get(repository.id)
                if (
                  !threw &&
                  !state.isCommitting &&
                  (run === undefined || run.finished)
                ) {
                  threw = true
                  throw notificationFailure
                }
              })
        t.after(() => subscription.dispose())
        const shown = deferred<void>()
        const popupSubscription = h.appStore.onDidUpdate(() => {
          if (
            h.appStore['popupManager'].currentPopup?.type ===
            PopupType.AssistedCommitDisclaimer
          ) {
            shown.resolve()
          }
        })
        t.after(() => popupSubscription.dispose())
        const operation = h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        if (exit === 'decline') {
          await shown.promise
          const popup = h.appStore['popupManager'].currentPopup
          assert.ok(popup?.id !== undefined)
          h.dispatcher.closePopupById(popup.id)
        }
        const outcome = await operation
        assert.strictEqual(threw, true)
        assert.strictEqual(
          outcome.kind,
          exit === 'cancel'
            ? 'cancelled'
            : exit === 'decline'
            ? 'declined'
            : 'error'
        )
        if (outcome.kind === 'error') {
          const causes = assistedCommitErrorCauses(outcome.error)
          assert.ok(causes.includes(originalFailure))
          assert.ok(causes.includes(notificationFailure))
        } else {
          assert.strictEqual(h.assisted.state['runs'].has(repository.id), false)
        }
        assert.strictEqual(await count(repository), 1)
        assert.strictEqual(h.commits.mock.callCount(), 0)
        assert.strictEqual(h.state(repository).isCommitting, false)
      })
    }
  }
})
