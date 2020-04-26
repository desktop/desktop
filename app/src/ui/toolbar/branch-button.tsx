import {
  SelectionType,
  Foldout,
  PossibleSelections,
  FoldoutType,
} from '../../lib/app-state'
import { Dispatcher } from '../dispatcher'
import { BranchDropdown } from './branch-dropdown'
import { DropdownState } from './dropdown'
import { TutorialStep } from '../../models/tutorial-step'
import {
  getUncommittedChangesStrategy,
  UncommittedChangesStrategyKind,
} from '../../models/uncommitted-changes-strategy'
import * as React from 'react'
import { BranchesTab } from '../../models/branches-tab'

interface IBranchToolbarButtonProps {
  readonly currentFoldout: Foldout | null
  readonly currentOnboardingTutorialStep: TutorialStep
  readonly dispatcher: Dispatcher
  readonly selectedBranchesTab: BranchesTab
  readonly selection: PossibleSelections | null
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

export function BranchToolbarButton({
  currentFoldout,
  currentOnboardingTutorialStep,
  dispatcher,
  selectedBranchesTab,
  selection,
  uncommittedChangesStrategyKind,
}: IBranchToolbarButtonProps): JSX.Element | null {
  if (selection == null || selection.type !== SelectionType.Repository) {
    return null
  }

  const isOpen =
    currentFoldout !== null && currentFoldout.type === FoldoutType.Branch

  const repository = selection.repository
  const { branchesState, changesState } = selection.state
  const hasAssociatedStash = changesState.stashEntry !== null
  const hasChanges = changesState.workingDirectory.files.length > 0

  const onBranchDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      dispatcher.showFoldout({ type: FoldoutType.Branch })
    } else {
      dispatcher.closeFoldout(FoldoutType.Branch)
    }
  }

  return (
    <BranchDropdown
      dispatcher={dispatcher}
      isOpen={isOpen}
      onDropDownStateChanged={onBranchDropdownStateChanged}
      repository={repository}
      repositoryState={selection.state}
      selectedTab={selectedBranchesTab}
      pullRequests={branchesState.openPullRequests}
      currentPullRequest={branchesState.currentPullRequest}
      isLoadingPullRequests={branchesState.isLoadingPullRequests}
      shouldNudge={currentOnboardingTutorialStep === TutorialStep.CreateBranch}
      selectedUncommittedChangesStrategy={getUncommittedChangesStrategy(
        uncommittedChangesStrategyKind
      )}
      couldOverwriteStash={hasChanges && hasAssociatedStash}
    />
  )
}
