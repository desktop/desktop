import * as React from 'react'
import {
  PossibleSelections,
  Foldout,
  SelectionType,
  IRepositoryState,
} from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { Dispatcher } from '../dispatcher'
import { RepositoryToolbarButton } from './repository-button'
import { BranchToolbarButton } from './branch-button'
import { TutorialStep } from '../../models/tutorial-step'
import { BranchesTab } from '../../models/branches-tab'
import { UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'
import { PushPullButton } from './push-pull-button'
import { RevertProgress } from './revert-progress'
import { TipState } from '../../models/tip'
import { isCurrentBranchForcePush } from '../../lib/rebase'

interface IToolbarProps {
  currentFoldout: Foldout | null
  currentOnboardingTutorialStep: TutorialStep
  dispatcher: Dispatcher
  renderRepositoryList: () => JSX.Element
  repositories: ReadonlyArray<Repository | CloningRepository>
  selectedBranchesTab: BranchesTab
  selection: PossibleSelections | null
  sidebarWidth: number
  uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

/** The main application toolbar component. */
export function Toolbar({
  currentFoldout,
  currentOnboardingTutorialStep,
  dispatcher,
  renderRepositoryList,
  repositories,
  selectedBranchesTab,
  selection,
  sidebarWidth,
  uncommittedChangesStrategyKind,
}: IToolbarProps) {
  return (
    <div id="desktop-app-toolbar" className="toolbar">
      <div className="sidebar-section" style={{ width: sidebarWidth }}>
        <RepositoryToolbarButton
          currentFoldout={currentFoldout}
          dispatcher={dispatcher}
          renderRepositoryList={renderRepositoryList}
          repositories={repositories}
          selection={selection}
          sidebarWidth={sidebarWidth}
        />
      </div>
      <BranchToolbarButton
        currentFoldout={currentFoldout}
        dispatcher={dispatcher}
        currentOnboardingTutorialStep={currentOnboardingTutorialStep}
        selectedBranchesTab={selectedBranchesTab}
        uncommittedChangesStrategyKind={uncommittedChangesStrategyKind}
        selection={selection}
      />
      {selection && selection.type === SelectionType.Repository ? (
        selection.state.revertProgress ? (
          <RevertProgress progress={selection.state.revertProgress} />
        ) : (
          renderPushPullButton(
            dispatcher,
            currentOnboardingTutorialStep,
            selection
          )
        )
      ) : null}
    </div>
  )
}

const renderPushPullButton = (
  dispatcher: Dispatcher,
  currentOnboardingTutorialStep: TutorialStep,
  {
    repository,
    state,
    state: { changesState, branchesState },
  }: {
    type: SelectionType.Repository
    repository: Repository
    state: IRepositoryState
  }
) => (
  <PushPullButton
    dispatcher={dispatcher}
    repository={repository}
    aheadBehind={state.aheadBehind}
    remoteName={
      branchesState.tip.kind === TipState.Valid &&
      branchesState.tip.branch.remote !== null
        ? branchesState.tip.branch.remote
        : state.remote
        ? state.remote.name
        : null
    }
    lastFetched={state.lastFetched}
    networkActionInProgress={state.isPushPullFetchInProgress}
    progress={state.pushPullFetchProgress}
    tipState={branchesState.tip.kind}
    pullWithRebase={branchesState.pullWithRebase}
    rebaseInProgress={
      changesState.conflictState !== null &&
      changesState.conflictState.kind === 'rebase'
    }
    isForcePush={isCurrentBranchForcePush(branchesState, state.aheadBehind)}
    shouldNudge={currentOnboardingTutorialStep === TutorialStep.PushBranch}
  />
)
