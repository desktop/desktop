import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { ipcRenderer } from 'electron'
import { join } from 'path'
import { RepositorySectionTab } from '../../../src/lib/app-state'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { acquireAssistedCommitGitLease } from '../../../src/lib/git/repository-operation'
import { ISerializableMenuItem } from '../../../src/lib/menu-item'
import { AheadBehindStore } from '../../../src/lib/stores/ahead-behind-store'
import { AssistedCommitRunState } from '../../../src/models/assisted-commit-run'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { ImageDiffType } from '../../../src/models/diff'
import { DragType } from '../../../src/models/drag-drop'
import {
  MultiCommitOperationDetail,
  MultiCommitOperationKind,
} from '../../../src/models/multi-commit-operation'
import { TutorialStep } from '../../../src/models/tutorial-step'
import { RepositoryView } from '../../../src/ui/repository'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { setupEmptyRepository } from '../../helpers/repositories'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const identity = new CommitIdentity(
  'History Fixture',
  'history@example.com',
  new Date('2026-01-01T00:00:00Z')
)
const commits = ['newer', 'older'].map(
  sha => new Commit(sha, sha, sha, '', identity, identity, [], [], [])
)

async function renderHistory(t: TestContext) {
  const repository = await setupEmptyRepository(t)
  const h = await createAssistedCommitRunHarness(t)
  t.mock.method(h.dispatcher, 'initializeCompare', async () => {})
  t.mock.method(h.dispatcher, 'loadNextCommitBatch', async () => {})
  t.mock.method(h.dispatcher, 'updateCompareForm', () => {})
  const menus = new Array<ReadonlyArray<ISerializableMenuItem>>()
  t.mock.method(
    ipcRenderer,
    'invoke',
    async (channel: string, items: ReadonlyArray<ISerializableMenuItem>) => {
      assert.strictEqual(channel, 'show-contextual-menu')
      menus.push(items)
      return null
    }
  )
  h.stores.repositoryStateCache.update(repository, state => ({
    selectedSection: RepositorySectionTab.History,
    compareState: {
      ...state.compareState,
      commitSHAs: commits.map(commit => commit.sha),
    },
    commitLookup: new Map(commits.map(commit => [commit.sha, commit])),
    localCommitSHAs: commits.map(commit => commit.sha),
    commitSelection: {
      ...state.commitSelection,
      shas: commits.map(commit => commit.sha),
    },
  }))
  const ref = React.createRef<RepositoryView>()
  const width = { value: 400, min: 200, max: 600 }
  const aheadBehindStore = new AheadBehindStore()
  const element = () => (
    <RepositoryView
      ref={ref}
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
      accounts={[]}
      shouldShowGenerateCommitMessageCallOut={false}
      isShowingModal={false}
      isShowingFoldout={false}
      isExternalEditorAvailable={false}
      resolvedExternalEditor={null}
      onOpenInExternalEditor={() => {}}
      appMenu={undefined}
      currentTutorialStep={TutorialStep.NotApplicable}
      onExitTutorial={() => {}}
      aheadBehindStore={aheadBehindStore}
      onCherryPick={() => {}}
      showChangesFilter={false}
      skipCommitHooks={false}
      signOffCommits={false}
      allowEmptyCommit={false}
      onUpdateCommitOptions={() => {}}
    />
  )
  const view = render(element())
  const sidebar = () => {
    const component = ref.current?.['compareSidebarRef'].current
    assert.ok(component)
    return component
  }
  const commitList = () => {
    const component = sidebar()['commitListRef'].current
    assert.ok(component)
    return component
  }
  const list = commitList()['listRef'].current
  assert.ok(list)
  act(() => list.setState({ width: 400, height: 300 }))
  t.after(() => {
    fireEvent.mouseUp(document)
    view.unmount()
  })

  const rerender = () => view.rerender(element())
  const setRun = (assistedCommit: AssistedCommitRunState) => {
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      assistedCommit,
    }))
    rerender()
  }
  const assertActionsLocked = (locked: boolean) => {
    const component = commitList()
    const list = component['listRef'].current
    assert.ok(list)
    assert.strictEqual(
      list.props.insertionDragType,
      locked ? undefined : DragType.Commit
    )
    assert.strictEqual(
      view.container.querySelector('.list-item-insertion-overlay') !== null,
      !locked
    )
    const rows = screen.getAllByRole('option')
    fireEvent.contextMenu(rows[0])
    const menu = menus.at(-1)
    assert.ok(menu)
    for (const action of ['Cherry-pick', 'Squash', 'Reorder']) {
      const item: ISerializableMenuItem | undefined = menu.find(candidate =>
        candidate.label?.startsWith(action)
      )
      assert.ok(item, action)
      assert.strictEqual(item.enabled, !locked, action)
    }
    const draggable = rows[0].querySelector('.draggable')
    assert.ok(draggable)
    fireEvent.mouseDown(draggable, { button: 0 })
    assert.strictEqual(document.onmouseup === null, locked)
    fireEvent.mouseUp(document)
  }
  return {
    ...h,
    repository,
    rerender,
    setRun,
    sidebar,
    commitList,
    assertActionsLocked,
  }
}

function errorState(
  retry: 'recovery' | 'refresh' | null,
  settling: boolean = false
): AssistedCommitRunState {
  return {
    kind: 'error',
    runId: 'history-run',
    error: new ErrorWithMetadata(new Error('Assisted run failed'), {}),
    retry,
    selectionNeedsReview: false,
    settling,
  }
}

const lockedRuns: ReadonlyArray<AssistedCommitRunState> = [
  { kind: 'awaiting-consent', runId: 'history-run', cancelRequested: false },
  { kind: 'preparing', runId: 'history-run', cancelRequested: false },
  { kind: 'capturing', runId: 'history-run', cancelRequested: false },
  { kind: 'analyzing', runId: 'history-run', cancelRequested: false },
  {
    kind: 'summarizing-selection',
    runId: 'history-run',
    cancelRequested: false,
  },
  { kind: 'validating', runId: 'history-run', cancelRequested: false },
  {
    kind: 'committing',
    runId: 'history-run',
    index: 0,
    total: 2,
    title: 'Selected changes',
    cancelRequested: false,
  },
  { kind: 'rolling-back', runId: 'history-run' },
  { kind: 'refreshing', runId: 'history-run' },
  { kind: 'closing', runId: 'history-run' },
  { kind: 'finishing', runId: 'history-run', cancelRequested: false },
  errorState('recovery'),
  errorState('refresh'),
  errorState(null, true),
]

describe('assisted history action locks', () => {
  for (const state of lockedRuns) {
    const label =
      state.kind === 'error'
        ? `error/${state.retry}/settling=${state.settling}`
        : state.kind
    it(`locks actions without reporting a multicommit operation during ${label}`, async t => {
      const history = await renderHistory(t)
      history.setRun(state)
      history.assertActionsLocked(true)
      assert.strictEqual(
        history.sidebar().props.isMultiCommitOperationInProgress,
        false
      )
      assert.strictEqual(
        history.commitList().props.isMultiCommitOperationInProgress,
        false
      )
      assert.strictEqual(
        history.commitList().props.isAssistedCommitRepositoryLocked,
        true
      )
    })
  }

  it('updates rendered actions when a run starts and fully settles', async t => {
    const history = await renderHistory(t)
    history.assertActionsLocked(false)
    history.setRun({
      kind: 'analyzing',
      runId: 'history-run',
      cancelRequested: false,
    })
    history.assertActionsLocked(true)
    history.setRun(errorState(null))
    history.assertActionsLocked(false)
    history.setRun({ kind: 'idle' })
    history.assertActionsLocked(false)
    assert.strictEqual(
      history.sidebar().props.isMultiCommitOperationInProgress,
      false
    )
  })

  it('retains shared-resource locks independently of local run and multicommit state', async t => {
    const history = await renderHistory(t)
    const source = await setupEmptyRepository(t)
    const lease = await acquireAssistedCommitGitLease(source.path, [
      source.path,
      join(history.repository.path, '.git'),
    ])
    t.after(() => lease.release())
    history.rerender()
    history.assertActionsLocked(true)
    assert.strictEqual(
      history.state(history.repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(
      history.sidebar().props.isMultiCommitOperationInProgress,
      false
    )
    assert.strictEqual(
      history.commitList().props.isAssistedCommitRepositoryLocked,
      true
    )
    lease.release()
    history.rerender()
    history.assertActionsLocked(false)
  })

  const operations: ReadonlyArray<MultiCommitOperationDetail> = [
    {
      kind: MultiCommitOperationKind.Rebase,
      sourceBranch: null,
      commits,
      currentTip: commits[0].sha,
    },
    {
      kind: MultiCommitOperationKind.CherryPick,
      sourceBranch: null,
      commits,
      branchCreated: false,
    },
    {
      kind: MultiCommitOperationKind.Squash,
      commits,
      currentTip: commits[0].sha,
      lastRetainedCommitRef: null,
      targetCommit: commits[0],
      commitContext: { summary: 'Squashed commits', description: null },
    },
    {
      kind: MultiCommitOperationKind.Merge,
      sourceBranch: null,
      isSquash: false,
    },
    {
      kind: MultiCommitOperationKind.Reorder,
      commits,
      currentTip: commits[0].sha,
      lastRetainedCommitRef: null,
      beforeCommit: null,
    },
  ]
  for (const operation of operations) {
    it(`preserves ${operation.kind} multicommit state and action locks`, async t => {
      const history = await renderHistory(t)
      history.dispatcher.initializeMultiCommitOperation(
        history.repository,
        operation,
        null,
        commits,
        commits[0].sha
      )
      history.rerender()
      history.assertActionsLocked(true)
      assert.strictEqual(
        history.sidebar().props.isMultiCommitOperationInProgress,
        true
      )
      assert.strictEqual(
        history.commitList().props.isMultiCommitOperationInProgress,
        true
      )
      assert.notStrictEqual(
        history.commitList().props.isAssistedCommitRepositoryLocked,
        true
      )
    })
  }
})
