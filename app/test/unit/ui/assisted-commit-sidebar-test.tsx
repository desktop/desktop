import assert from 'node:assert'
import { before, describe, it } from 'node:test'
import { ipcRenderer } from 'electron'
import * as React from 'react'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { ChangesSidebar } from '../../../src/ui/changes/sidebar'
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
    fireEvent.click(
      screen.getByRole('button', { name: /Commit.*with Copilot/ })
    )
    await analyzing.promise
    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'Cancel' }))
    )
    mounted = false
    view.unmount()
    view = render(element())
    mounted = true
    assert.ok(
      screen.getByText('Planning selected changes…', { selector: '.title' })
    )
    assert.ok(screen.getByRole('button', { name: 'Cancel' }))
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
  })
})
