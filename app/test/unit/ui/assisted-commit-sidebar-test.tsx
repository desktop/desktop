import assert from 'node:assert'
import { before, describe, it } from 'node:test'
import { ipcRenderer } from 'electron'
import * as React from 'react'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { ChangesSidebar } from '../../../src/ui/changes/sidebar'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { TipState } from '../../../src/models/tip'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { seed, count } from '../../helpers/assisted-commit'
import {
  deferred,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

before(() => {
  ipcRenderer.send = () => {}
})

class ListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperties(target, {
      offsetWidth: { configurable: true, value: 400 },
      offsetHeight: { configurable: true, value: 400 },
    })
    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, 400, 400),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

describe('real assisted Changes sidebar wiring', () => {
  it('one click crosses Sidebar/Filter/CommitMessage/Dispatcher into a real local commit and survives unmount', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    const invoke = t.mock.method(h.dispatcher, 'createCopilotAssistedCommits')
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const element = () => {
      const state = h.state(repository)
      return (
        <ChangesSidebar
          repository={repository}
          changes={state.changesState}
          aheadBehind={state.aheadBehind}
          dispatcher={h.dispatcher}
          commitAuthor={state.commitAuthor}
          branch={
            state.branchesState.tip.kind === TipState.Valid
              ? state.branchesState.tip.branch.name
              : null
          }
          emoji={new Map()}
          mostRecentLocalCommit={null}
          issuesStore={h.stores.issuesStore}
          availableWidth={400}
          isCommitting={state.isCommitting}
          hookProgress={state.hookProgress}
          onShowCommitProgress={undefined}
          isGeneratingCommitMessage={false}
          shouldShowGenerateCommitMessageCallOut={false}
          commitToAmend={null}
          isPushPullFetchInProgress={false}
          gitHubUserStore={h.stores.gitHubUserStore}
          focusCommitMessage={false}
          askForConfirmationOnDiscardChanges={false}
          askForConfirmationOnCommitFilteredChanges={false}
          accounts={h.appStore['accounts']}
          isShowingModal={false}
          isShowingFoldout={false}
          onOpenInExternalEditor={() => {}}
          onChangesListScrolled={() => {}}
          shouldNudgeToCommit={false}
          commitSpellcheckEnabled={false}
          showCommitLengthWarning={false}
          showChangesFilter={true}
          skipCommitHooks={state.skipCommitHooks}
          signOffCommits={state.signOffCommits}
          allowEmptyCommit={state.allowEmptyCommit}
          onUpdateCommitOptions={(repo, options) =>
            h.dispatcher.updateCommitOptions(repo, options)
          }
        />
      )
    }
    let view = render(element())
    let mounted = true
    const subscription = h.appStore.onDidUpdate(() => {
      if (mounted) {
        view.rerender(element())
      }
    })
    t.after(() => {
      mounted = false
      subscription.dispose()
      view.unmount()
    })
    const dropdown = () =>
      screen.getByRole('button', { name: 'Choose how to commit' })
    fireEvent.click(dropdown())
    fireEvent.click(screen.getByText('Commit with Copilot'))
    fireEvent.keyDown(dropdown(), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' })
    fireEvent.click(dropdown())
    fireEvent.click(screen.getByText('Commit with Copilot'))
    await waitFor(async () => {
      const measures = await h.measures()
      assert.strictEqual(measures.commitModeDropdownOpenedCount, 3)
      assert.strictEqual(measures.commitModeSwitchedToCopilotCount, 1)
      assert.strictEqual(measures.commitModeSwitchedToManualCount, 1)
    })
    fireEvent.click(
      screen.getByRole('button', { name: /Commit.*with Copilot/ })
    )
    await analyzing.promise
    fireEvent.click(dropdown())
    assert.strictEqual((await h.measures()).commitModeDropdownOpenedCount, 3)
    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'Cancel' }))
    )
    const options = screen.getByRole('button', {
      name: 'Configure commit options',
    })
    assert.ok(options.closest('.copilot-commit-panel.with-options'))
    assert.strictEqual(options.getAttribute('aria-disabled'), 'true')
    mounted = false
    view.unmount()
    view = render(element())
    mounted = true
    assert.ok(
      screen.getByText('Planning selected changes…', { selector: '.title' })
    )
    assert.ok(screen.getByRole('button', { name: 'Cancel' }))
    assert.ok(
      screen
        .getByRole('button', { name: 'Configure commit options' })
        .closest('.copilot-commit-panel.with-options')
    )
    finish.resolve()
    assert.strictEqual(invoke.mock.callCount(), 1)
    assert.strictEqual((await invoke.mock.calls[0].result)?.kind, 'local-ready')
    await waitFor(() =>
      assert.strictEqual(h.state(repository).isCommitting, false)
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    await waitFor(() =>
      assert.notStrictEqual(
        screen
          .getByRole('button', { name: 'Configure commit options' })
          .getAttribute('aria-disabled'),
        'true'
      )
    )
  })

  it('ignores file inclusion changes before React rerenders when assisted commit locks the repository and rejects direct AppStore mutation promises asynchronously', async t => {
    const originalResizeObserver = window.ResizeObserver
    window.ResizeObserver = ListResizeObserver
    t.after(() => {
      window.ResizeObserver = originalResizeObserver
    })
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })

    const renderSidebar = () => {
      const state = h.state(repository)
      return (
        <ChangesSidebar
          repository={repository}
          changes={state.changesState}
          aheadBehind={state.aheadBehind}
          dispatcher={h.dispatcher}
          commitAuthor={state.commitAuthor}
          branch={
            state.branchesState.tip.kind === TipState.Valid
              ? state.branchesState.tip.branch.name
              : null
          }
          emoji={new Map()}
          mostRecentLocalCommit={null}
          issuesStore={h.stores.issuesStore}
          availableWidth={400}
          isCommitting={state.isCommitting}
          hookProgress={state.hookProgress}
          onShowCommitProgress={undefined}
          isGeneratingCommitMessage={false}
          shouldShowGenerateCommitMessageCallOut={false}
          commitToAmend={null}
          isPushPullFetchInProgress={false}
          gitHubUserStore={h.stores.gitHubUserStore}
          focusCommitMessage={false}
          askForConfirmationOnDiscardChanges={false}
          askForConfirmationOnCommitFilteredChanges={false}
          accounts={h.appStore['accounts']}
          isShowingModal={false}
          isShowingFoldout={false}
          onOpenInExternalEditor={() => {}}
          onChangesListScrolled={() => {}}
          shouldNudgeToCommit={false}
          commitSpellcheckEnabled={false}
          showCommitLengthWarning={false}
          showChangesFilter={true}
          skipCommitHooks={state.skipCommitHooks}
          signOffCommits={state.signOffCommits}
          allowEmptyCommit={state.allowEmptyCommit}
          onUpdateCommitOptions={(repo, options) =>
            h.dispatcher.updateCommitOptions(repo, options)
          }
        />
      )
    }

    const view = render(renderSidebar())
    t.after(() => view.unmount())
    const changeFileIncluded = t.mock.method(h.dispatcher, 'changeFileIncluded')
    const file = h.state(repository).changesState.workingDirectory.files[0]
    assert.ok(file)

    const running = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise

    try {
      // Simulate a checkbox click arriving before React rerenders with
      // isCommitting=true.
      const checkboxes = Array.from(
        view.container.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]'
        )
      )
      assert.ok(checkboxes.length >= 2)
      for (const checkbox of checkboxes) {
        fireEvent.click(checkbox)
      }
      assert.strictEqual(changeFileIncluded.mock.callCount(), 0)

      // Direct Promise-returning AppStore/Dispatcher calls should reject
      // asynchronously instead of throwing synchronously on event stacks.
      const promises: Array<Promise<unknown>> = []
      assert.doesNotThrow(() => {
        promises.push(h.dispatcher.changeFileIncluded(repository, file, false))
        promises.push(
          h.dispatcher.changeFileLineSelection(
            repository,
            file,
            file.selection.withSelectNone()
          )
        )
        promises.push(h.dispatcher.changeIncludeAllFiles(repository, false))
        promises.push(h.dispatcher.setShowCoAuthoredBy(repository, true))
        promises.push(h.dispatcher.setCoAuthors(repository, []))
        promises.push(h.dispatcher.setCommitMode(repository, 'manual'))
        promises.push(h.dispatcher.setPushAfterCommit(repository, true))
        promises.push(
          h.dispatcher.updateCommitOptions(repository, {
            allowEmptyCommit: true,
          })
        )
      })
      for (const promise of promises) {
        await assert.rejects(
          promise,
          /Finish or cancel the assisted commit run before changing this repository/
        )
      }
    } finally {
      finish.resolve()
      await running
    }
  })

  it('disables file inclusion checkboxes when assisted commit retains a locked recovery-retry error', async t => {
    const originalResizeObserver = window.ResizeObserver
    window.ResizeObserver = ListResizeObserver
    t.after(() => {
      window.ResizeObserver = originalResizeObserver
    })
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const state = h.state(repository)
    const lockedChangesState = {
      ...state.changesState,
      assistedCommit: {
        kind: 'error' as const,
        runId: 'run-locked',
        error: new ErrorWithMetadata(new Error('Refresh required'), {}),
        retry: 'refresh' as const,
        selectionNeedsReview: false,
        settling: false,
      },
    }

    const view = render(
      <ChangesSidebar
        repository={repository}
        changes={lockedChangesState}
        aheadBehind={state.aheadBehind}
        dispatcher={h.dispatcher}
        commitAuthor={state.commitAuthor}
        branch={
          state.branchesState.tip.kind === TipState.Valid
            ? state.branchesState.tip.branch.name
            : null
        }
        emoji={new Map()}
        mostRecentLocalCommit={null}
        issuesStore={h.stores.issuesStore}
        availableWidth={400}
        isCommitting={false}
        hookProgress={null}
        onShowCommitProgress={undefined}
        isGeneratingCommitMessage={false}
        shouldShowGenerateCommitMessageCallOut={false}
        commitToAmend={null}
        isPushPullFetchInProgress={false}
        gitHubUserStore={h.stores.gitHubUserStore}
        focusCommitMessage={false}
        askForConfirmationOnDiscardChanges={false}
        askForConfirmationOnCommitFilteredChanges={false}
        accounts={h.appStore['accounts']}
        isShowingModal={false}
        isShowingFoldout={false}
        onOpenInExternalEditor={() => {}}
        onChangesListScrolled={() => {}}
        shouldNudgeToCommit={false}
        commitSpellcheckEnabled={false}
        showCommitLengthWarning={false}
        showChangesFilter={true}
        skipCommitHooks={state.skipCommitHooks}
        signOffCommits={state.signOffCommits}
        allowEmptyCommit={state.allowEmptyCommit}
        onUpdateCommitOptions={(repo, options) =>
          h.dispatcher.updateCommitOptions(repo, options)
        }
      />
    )
    t.after(() => view.unmount())

    await waitFor(() =>
      assert.ok(
        view.container.querySelectorAll('input[type="checkbox"]').length >= 2
      )
    )
    const checkboxes = Array.from(
      view.container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]'
      )
    )
    for (const checkbox of checkboxes) {
      assert.strictEqual(checkbox.disabled, true)
    }
  })
})
