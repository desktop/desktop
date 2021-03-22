import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { Branch } from '../../models/branch'
import {
  CherryPickFlowStep,
  CherryPickStepKind,
  ConfirmAbortStep,
  ShowConflictsStep,
} from '../../models/cherry-pick'
import { ICherryPickProgress } from '../../models/progress'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ChooseTargetBranchDialog } from './choose-target-branch'
import { CherryPickProgressDialog } from './cherry-pick-progress-dialog'
import { CommitOneLine } from '../../models/commit'
import { CherryPickConflictsDialog } from './cherry-pick-conflicts-dialog'
import { WorkingDirectoryStatus } from '../../models/status'
import { getResolvedFiles } from '../../lib/status'
import { ConfirmCherryPickAbortDialog } from './confirm-cherry-pick-abort-dialog'

interface ICherryPickFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly step: CherryPickFlowStep
  readonly commits: ReadonlyArray<CommitOneLine>
  readonly progress: ICherryPickProgress | null
  readonly emoji: Map<string, string>

  /**
   * The branch the commits come from - needed so abort can switch back to it
   *
   * This can be null because if a cherry pick is started outside of Desktop
   * it is difficult to obtain the sourceBranch.
   */
  readonly sourceBranch: Branch | null

  /** Properties required for conflict flow step. */
  readonly workingDirectory: WorkingDirectoryStatus
  readonly userHasResolvedConflicts: boolean

  /**
   * Callbacks for the conflict selection components to let the user jump out
   * to their preferred editor.
   */
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void

  readonly onDismissed: () => void

  /**
   * Callback to hide the cherry pick flow and show a banner about the current
   * state of conflicts.
   */
  readonly onShowCherryPickConflictsBanner: (
    repository: Repository,
    targetBranchName: string,
    sourceBranch: Branch | null,
    commits: ReadonlyArray<CommitOneLine>
  ) => void
}

/** A component for initiating and performing a cherry pick. */
export class CherryPickFlow extends React.Component<ICherryPickFlowProps> {
  private onFlowEnded = () => {
    const { onDismissed, dispatcher, repository } = this.props
    onDismissed()
    dispatcher.endCherryPickFlow(repository)
  }

  private onCherryPick = (targetBranch: Branch) => {
    const { dispatcher, repository, commits, sourceBranch } = this.props
    dispatcher.cherryPick(repository, targetBranch, commits, sourceBranch)
  }

  private onContinueCherryPick = (step: ShowConflictsStep) => {
    const {
      dispatcher,
      repository,
      workingDirectory,
      commits,
      sourceBranch,
    } = this.props
    dispatcher.continueCherryPick(
      repository,
      workingDirectory.files,
      step.conflictState,
      commits,
      sourceBranch
    )
  }

  private onAbortCherryPick = (step: ShowConflictsStep) => {
    const {
      dispatcher,
      repository,
      workingDirectory,
      userHasResolvedConflicts,
    } = this.props
    const { conflictState } = step
    const { manualResolutions } = conflictState
    const { length: countResolvedConflicts } = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (userHasResolvedConflicts || countResolvedConflicts > 0) {
      dispatcher.setCherryPickFlowStep(repository, {
        kind: CherryPickStepKind.ConfirmAbort,
        conflictState,
      })
      return
    }

    this.abortCherryPick()
  }

  private abortCherryPick = async () => {
    const { dispatcher, repository, sourceBranch } = this.props

    await dispatcher.abortCherryPick(repository, sourceBranch)
    dispatcher.closePopup()
  }

  private showCherryPickConflictsBanner = (step: ShowConflictsStep) => {
    const { repository, sourceBranch, commits } = this.props
    this.props.onShowCherryPickConflictsBanner(
      repository,
      step.conflictState.targetBranchName,
      sourceBranch,
      commits
    )
  }

  private moveToShowConflictedFileState = (step: ConfirmAbortStep) => {
    const { conflictState } = step
    const { dispatcher, repository } = this.props
    dispatcher.setCherryPickFlowStep(repository, {
      kind: CherryPickStepKind.ShowConflicts,
      conflictState,
    })
  }

  public render() {
    const { step } = this.props

    switch (step.kind) {
      case CherryPickStepKind.ChooseTargetBranch: {
        const {
          allBranches,
          defaultBranch,
          currentBranch,
          recentBranches,
        } = step
        return (
          <ChooseTargetBranchDialog
            key="choose-target-branch"
            allBranches={allBranches}
            defaultBranch={defaultBranch}
            recentBranches={recentBranches}
            currentBranch={currentBranch}
            onCherryPick={this.onCherryPick}
            onDismissed={this.onFlowEnded}
            commitCount={this.props.commits.length}
          />
        )
      }
      case CherryPickStepKind.ShowProgress:
        if (this.props.progress === null) {
          log.error(
            `[CherryPickFlow] cherry-pick progress should not be null
            when showing progress. Skipping rendering..`
          )
          return null
        }
        return (
          <CherryPickProgressDialog
            progress={this.props.progress}
            emoji={this.props.emoji}
          />
        )
      case CherryPickStepKind.ShowConflicts:
        const {
          repository,
          resolvedExternalEditor,
          openFileInExternalEditor,
          openRepositoryInShell,
          dispatcher,
          workingDirectory,
          userHasResolvedConflicts,
          sourceBranch,
        } = this.props

        return (
          <CherryPickConflictsDialog
            dispatcher={dispatcher}
            repository={repository}
            step={step}
            userHasResolvedConflicts={userHasResolvedConflicts}
            workingDirectory={workingDirectory}
            onDismissed={this.props.onDismissed}
            onContinueCherryPick={this.onContinueCherryPick}
            onAbortCherryPick={this.onAbortCherryPick}
            showCherryPickConflictsBanner={this.showCherryPickConflictsBanner}
            openFileInExternalEditor={openFileInExternalEditor}
            resolvedExternalEditor={resolvedExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
            sourceBranchName={sourceBranch !== null ? sourceBranch.name : null}
          />
        )
      case CherryPickStepKind.ConfirmAbort:
        const {
          commits: { length: commitCount },
        } = this.props
        const sourceBranchName =
          this.props.sourceBranch !== null ? this.props.sourceBranch.name : null
        return (
          <ConfirmCherryPickAbortDialog
            step={step}
            commitCount={commitCount}
            sourceBranchName={sourceBranchName}
            onReturnToConflicts={this.moveToShowConflictedFileState}
            onConfirmAbort={this.abortCherryPick}
          />
        )
      case CherryPickStepKind.CommitsChosen:
      case CherryPickStepKind.HideConflicts:
        // no ui for this part of flow
        return null
      default:
        return assertNever(step, 'Unknown cherry-pick step found')
    }
  }
}
