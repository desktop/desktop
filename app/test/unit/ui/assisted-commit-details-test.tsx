import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'
import { RepositorySectionTab } from '../../../src/lib/app-state'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { AheadBehindStore } from '../../../src/lib/stores/ahead-behind-store'
import { AssistedCommitRunState } from '../../../src/models/assisted-commit-run'
import { ImageDiffType } from '../../../src/models/diff'
import { PopupType } from '../../../src/models/popup'
import { TutorialStep } from '../../../src/models/tutorial-step'
import { AppError } from '../../../src/ui/app-error'
import { RepositoryView } from '../../../src/ui/repository'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { seed } from '../../helpers/assisted-commit'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

describe('assisted commit error details', () => {
  for (const kind of ['push-error', 'error'] as const) {
    it(`opens the standard dialog with the exact ${kind} and retained causes from the real commit panel`, async t => {
      const source = await seed(t, { file: 'unchanged\n' })
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const message =
        'Long native failure\nremote: Full receiver diagnostic\n' +
        'Native detail '.repeat(60)
      const underlying = new Error(message, {
        cause: new AggregateError(
          [
            new Error('Original transport cause'),
            new Error('Owned cleanup diagnostic'),
          ],
          'Additional retained failures'
        ),
      })
      const error = new ErrorWithMetadata(underlying, { repository })
      const state: AssistedCommitRunState =
        kind === 'push-error'
          ? { kind, runId: 'run', attempted: true, settling: false, error }
          : {
              kind,
              runId: 'run',
              retry: 'recovery',
              settling: false,
              selectionNeedsReview: false,
              error,
            }
      h.stores.repositoryStateCache.update(repository, () => ({
        selectedSection: RepositorySectionTab.Changes,
      }))
      h.stores.repositoryStateCache.updateChangesState(repository, () => ({
        assistedCommit: state,
      }))
      const width = { value: 300, min: 200, max: 600 }
      const view = render(
        <RepositoryView
          repository={repository}
          state={h.state(repository)}
          dispatcher={h.dispatcher}
          emoji={new Map()}
          sidebarWidth={width}
          commitSummaryWidth={width}
          stashedFilesWidth={width}
          issuesStore={h.stores.issuesStore}
          gitHubUserStore={h.stores.gitHubUserStore}
          onViewCommitOnGitHub={() => {}}
          imageDiffType={ImageDiffType.TwoUp}
          hideWhitespaceInChangesDiff={false}
          hideWhitespaceInHistoryDiff={false}
          showSideBySideDiff={false}
          showDiffCheckMarks={false}
          preferAbsoluteDates={true}
          askForConfirmationOnDiscardChanges={false}
          askForConfirmationOnCommitFilteredChanges={false}
          askForConfirmationOnDiscardStash={false}
          askForConfirmationOnCheckoutCommit={false}
          focusCommitMessage={false}
          commitSpellcheckEnabled={false}
          showCommitLengthWarning={false}
          accounts={h.appStore['accounts']}
          shouldShowGenerateCommitMessageCallOut={false}
          isShowingModal={false}
          isShowingFoldout={false}
          isExternalEditorAvailable={false}
          resolvedExternalEditor={null}
          onOpenInExternalEditor={() => {}}
          appMenu={undefined}
          currentTutorialStep={TutorialStep.NotApplicable}
          onExitTutorial={() => {}}
          aheadBehindStore={new AheadBehindStore()}
          onCherryPick={() => {}}
          showChangesFilter={false}
          skipCommitHooks={false}
          signOffCommits={false}
          allowEmptyCommit={false}
          onUpdateCommitOptions={() => {}}
        />
      )
      assert.strictEqual(view.container.textContent?.includes(message), false)
      const details = screen.getByRole('button', { name: 'Details' })
      details.focus()
      assert.strictEqual(document.activeElement, details)
      fireEvent.click(details)
      const popup = h.appStore.getState().currentPopup
      assert.ok(popup?.type === PopupType.Error)
      assert.strictEqual(popup.error, error)
      assert.strictEqual(popup.showCauses, true)
      view.unmount()
      render(
        <AppError
          error={popup.error}
          showCauses={popup.showCauses}
          onDismissed={() => {}}
          onShowPopup={() => {}}
          onRetryAction={() =>
            assert.fail('Details must not retry a generic operation')
          }
        />
      )
      const dialog = screen.getByRole('alertdialog', { hidden: true })
      assert.ok(dialog.textContent?.includes(message))
      assert.ok(within(dialog).getByText('Original transport cause'))
      assert.ok(within(dialog).getByText('Owned cleanup diagnostic'))
      assert.strictEqual(screen.queryByRole('button', { name: /Retry/ }), null)
    })
  }

  it('leaves ordinary error dialogs unchanged unless causes are explicitly requested', t => {
    const send = ipcRenderer.send
    ipcRenderer.send = () => {}
    t.after(() => {
      ipcRenderer.send = send
    })
    render(
      <AppError
        error={
          new Error('Ordinary error', {
            cause: new Error('Hidden ordinary cause'),
          })
        }
        onDismissed={() => {}}
        onShowPopup={() => {}}
        onRetryAction={() => {}}
      />
    )
    assert.ok(screen.getByText('Ordinary error'))
    assert.strictEqual(screen.queryByText('Hidden ordinary cause'), null)
  })
})
