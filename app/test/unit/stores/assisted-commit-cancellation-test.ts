import { it, describe } from 'node:test'
import { seed, count } from '../../helpers/assisted-commit'
import { writeFile, chmod } from 'fs/promises'
import { join } from 'path'
import {
  createAssistedCommitRunHarness,
  partialSelectionFixture,
} from '../../helpers/assisted-commit-run'
import {
  wholeSelectionResponse,
  deferred,
} from '../../helpers/copilot-assisted-commit'
import assert from 'node:assert'
import { DiffSelectionType, DiffType } from '../../../src/models/diff'
import { PopupType } from '../../../src/models/popup'
import { withRepositoryGitOperation } from '../../../src/lib/git/repository-operation'
import { writeFileSync } from 'fs'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'

describe('AppStore assisted commit cancellation', () => {
  it(
    'requires reselection after a newly introduced executable mode change during cancellation',
    { skip: __WIN32__ },
    async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        await chmod(join(repository.path, 'file'), 0o755)
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      const state = h.state(repository)
      assert.ok(
        state.changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
      )
      assert.ok(
        state.changesState.assistedCommit.kind === 'error' &&
          state.changesState.assistedCommit.selectionNeedsReview
      )
    }
  )

  it('registers consent cancellation before publishing awaiting-consent to reentrant observers', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.dialogs['lastConsent'] = null
    const cancellationObserved = deferred<void>()
    let cancelled = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !cancelled &&
        h.state(repository).changesState.assistedCommit.kind ===
          'awaiting-consent'
      ) {
        cancelled = true
        h.cancel(repository)
        cancellationObserved.resolve()
      }
    })
    t.after(() => subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await cancellationObserved.promise
    assert.strictEqual((await operation).kind, 'cancelled')
  })

  for (const exit of ['cancel', 'decline'] as const) {
    it(`invalidates content drift on pre-capture ${exit} independently of cancellation classification`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.assisted.dialogs['lastConsent'] = null
      const shown = deferred<void>()
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          h.appStore['popupManager'].currentPopup?.type ===
          PopupType.AssistedCommitDisclaimer
        ) {
          shown.resolve()
        }
      })
      t.after(() => subscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      await shown.promise
      await writeFile(join(repository.path, 'file'), 'new unselected content\n')
      if (exit === 'cancel') {
        h.cancel(repository)
      } else {
        const popup = h.appStore['popupManager'].currentPopup
        assert.ok(popup?.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      }
      const outcome = await operation
      assert.strictEqual(outcome.kind, 'error')
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error' && state.retry === 'refresh')
      assert.strictEqual(h.propose.mock.callCount(), 0)
    })
  }

  it('cancels reader draining without waiting behind its own acquired lease', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    const reader = withRepositoryGitOperation(
      repository.path,
      'read',
      async () => {
        entered.resolve()
        await finish.promise
      }
    )
    await entered.promise
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await new Promise(resolve => setTimeout(resolve, 100))
    h.cancel(repository)
    finish.resolve()
    await reader
    const outcome = await Promise.race([
      operation.then(result => result.kind),
      new Promise<string>(resolve =>
        setTimeout(() => resolve('pending'), 2000)
      ),
    ])
    assert.strictEqual(outcome, 'cancelled')
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it('fences uncaptured cancellation after awaited HEAD verification, not only before it', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    h.assisted.dialogs['lastConsent'] = null
    const verifyHead = h.assisted.selections['assertCapturedHead'].bind(
      h.assisted.selections
    )
    let changed = false
    h.assisted.selections['assertCapturedHead'] = (run, head) => {
      verifyHead(run, head)
      if (!changed) {
        changed = true
        const next = [...current]
        next[1] = 'new earlier unselected\n'
        // eslint-disable-next-line no-sync
        writeFileSync(join(repository.path, 'file'), next.join(''))
      }
    }
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.state(repository).changesState.assistedCommit.kind ===
        'awaiting-consent'
      ) {
        h.cancel(repository)
      }
    })
    t.after(() => subscription.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.selectionNeedsReview)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('still aborts Cancel when its synchronous update observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    const owned = h.assisted.state['runs'].get(repository.id)
    assert.ok(owned)
    let threw = false
    const subscription = h.appStore.onDidUpdate(() => {
      const state = h.state(repository).changesState.assistedCommit
      if (!threw && state.kind === 'analyzing' && state.cancelRequested) {
        threw = true
        throw new Error('Synthetic Cancel observer failure')
      }
    })
    t.after(() => subscription.dispose())
    assert.throws(() => h.cancel(repository), /Cancel observer failure/)
    const aborted = owned.controller.signal.aborted
    finish.resolve()
    await operation
    assert.strictEqual(aborted, true)
    assert.strictEqual(await count(repository), 1)
  })

  for (const exit of ['cancel', 'decline'] as const) {
    it(`preserves multiple unchanged partial masks on pre-capture ${exit}, independently of displayed row`, async t => {
      const base = Array.from(
        { length: 60 },
        (_, index) => `line ${index + 1}\n`
      )
      const source = await seed(t, {
        a: base.join(''),
        b: base.join(''),
      })
      const current = [...base]
      current[3] = 'selected prefix\n'
      current[49] = 'unselected suffix\n'
      for (const path of ['a', 'b']) {
        await writeFile(join(source.path, path), current.join(''))
      }
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      for (const path of ['a', 'b']) {
        const toDisplay = h
          .request(repository)
          .files.find(file => file.path === path)
        assert.ok(toDisplay !== undefined)
        await h.dispatcher.selectWorkingDirectoryFiles(repository, [toDisplay])
        await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
        const file = h
          .request(repository)
          .files.find(file => file.path === path)
        assert.ok(file !== undefined)
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
      }
      const selected = h.request(repository)
      assert.strictEqual(selected.files.length, 2)
      h.assisted.dialogs['lastConsent'] = null
      const shown = deferred<void>()
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          h.appStore['popupManager'].currentPopup?.type ===
          PopupType.AssistedCommitDisclaimer
        ) {
          shown.resolve()
        }
      })
      t.after(() => subscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        selected
      )
      await shown.promise
      if (exit === 'cancel') {
        h.cancel(repository)
      } else {
        const popup = h.appStore['popupManager'].currentPopup
        assert.ok(popup?.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      }
      const outcome = await operation
      assert.strictEqual(
        outcome.kind,
        exit === 'cancel' ? 'cancelled' : 'declined'
      )
      const retained = h.request(repository)
      assert.strictEqual(retained.files.length, 2)
      for (const file of selected.files) {
        assert.ok(
          retained.files
            .find(current => current.id === file.id)
            ?.selection.equals(file.selection)
        )
      }
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
    })
  }

  for (const exit of ['cancel', 'decline'] as const) {
    it(`keeps ${exit} controlled when the first idle notification throws before native settlement`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      if (exit === 'decline') {
        h.assisted.dialogs['lastConsent'] = null
      }
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      let threw = false
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          !threw &&
          h.state(repository).changesState.assistedCommit.kind === 'idle'
        ) {
          threw = true
          throw new Error('Synthetic first idle notification failure')
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
        exit === 'cancel' ? 'cancelled' : 'declined'
      )
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(h.assisted.state['runs'].has(repository.id), false)
      assert.strictEqual(await count(repository), 1)
      assert.strictEqual(h.commits.mock.callCount(), 0)
    })
  }
})
