import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { Branch } from '../../models/branch'
import {
  CherryPickFlowStep,
  CherryPickStepKind,
  ConfirmAbortStep,
} from '../../models/cherry-pick'
import { ICherryPickProgress } from '../../models/progress'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ChooseTargetBranchDialog } from './choose-target-branch'
import { CherryPickProgressDialog } from './cherry-pick-progress-dialog'
import { CommitOneLine } from '../../models/commit'
import { WorkingDirectoryStatus } from '../../models/status'
import { getResolvedFiles } from '../../lib/status'
import { ConfirmCherryPickAbortDialog } from './confirm-cherry-pick-abort-dialog'
import { CreateBranch } from '../create-branch'
import { String } from 'aws-sdk/clients/acm'
import { ConflictsDialog } from '../multi-commit-operation/conflicts-dialog'

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

  private onChooseBranch = (targetBranch: Branch) => {
    const { dispatcher, repository, commits, sourceBranch } = this.props
    dispatcher.setCherryPickBranchCreated(repository, false)
    dispatcher.cherryPick(repository, targetBranch, commits, sourceBranch)
  }

  private onContinueCherryPick = async () => {
    const {
      dispatcher,
      repository,
      workingDirectory,
      commits,
      sourceBranch,
      step,
    } = this.props

    if (step.kind !== CherryPickStepKind.ShowConflicts) {
      // This shouldn't happen, but needed the type checking.
      log.error(
        '[Cherry-pick] Invoked continue of cherry-pick without being in a conflict step.'
      )
      this.onFlowEnded()
      return
    }

    await dispatcher.continueCherryPick(
      repository,
      workingDirectory.files,
      step.conflictState,
      commits,
      sourceBranch
    )
  }

  private onAbortCherryPick = async () => {
    const {
      dispatcher,
      repository,
      workingDirectory,
      userHasResolvedConflicts,
      step,
    } = this.props

    if (step.kind !== CherryPickStepKind.ShowConflicts) {
      // This shouldn't happen, but needed the type checking.
      log.error(
        '[Cherry-pick] Invoked abort of cherry-pick without being in a conflict step.'
      )
      this.onFlowEnded()
      return
    }

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

    return this.abortCherryPick()
  }

  private setConflictsHaveBeenResolved = () => {
    this.props.dispatcher.setCherryPickConflictsResolved(this.props.repository)
  }

  private abortCherryPick = async () => {
    const { dispatcher, repository, sourceBranch } = this.props

    await dispatcher.abortCherryPick(repository, sourceBranch)
    dispatcher.closePopup()
  }

  private moveToShowConflictedFileState = (step: ConfirmAbortStep) => {
    const { conflictState } = step
    const { dispatcher, repository } = this.props
    dispatcher.setCherryPickFlowStep(repository, {
      kind: CherryPickStepKind.ShowConflicts,
      conflictState,
    })
  }

  private onCreateNewBranch = (targetBranchName: String) => {
    const { dispatcher, repository } = this.props
    dispatcher.setCherryPickCreateBranchFlowStep(repository, targetBranchName)
  }

  private onCreateBranchAndCherryPick = (
    branchName: string,
    startPoint: string | null,
    noTrackOption: boolean
  ) => {
    const { dispatcher, repository, commits, sourceBranch } = this.props
    if (this.props.step.kind !== CherryPickStepKind.CreateBranch) {
      log.warn(
        '[cherryPickFlow] - Invalid cherry-picking state for creating a branch.'
      )
      this.onFlowEnded()
      return
    }

    dispatcher.startCherryPickWithBranchName(
      repository,
      branchName,
      startPoint,
      noTrackOption,
      commits,
      sourceBranch
    )
  }

  private onConflictsDialogDismissed = () => {
    const { repository, sourceBranch, commits, step } = this.props
    if (step.kind !== CherryPickStepKind.ShowConflicts) {
      // This shouldn't happen, but needed the type checking.
      log.error(
        '[Cherry-pick] Cannot show conflicts banner without being in a conflict step.'
      )
      this.onFlowEnded()
      return
    }

    this.props.onShowCherryPickConflictsBanner(
      repository,
      step.conflictState.targetBranchName,
      sourceBranch,
      commits
    )
    this.props.onDismissed()
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
            onCherryPick={this.onChooseBranch}
            onDismissed={this.onFlowEnded}
            commitCount={this.props.commits.length}
            onCreateNewBranch={this.onCreateNewBranch}
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

        const { conflictState } = step
        const { manualResolutions, targetBranchName: ourBranch } = conflictState

        const submit = __DARWIN__
          ? 'Continue Cherry-pick'
          : 'Continue cherry-pick'
        const abort = __DARWIN__ ? 'Abort Cherry-pick' : 'Abort cherry-pick'

        return (
          <ConflictsDialog
            dispatcher={dispatcher}
            repository={repository}
            workingDirectory={workingDirectory}
            userHasResolvedConflicts={userHasResolvedConflicts}
            resolvedExternalEditor={resolvedExternalEditor}
            ourBranch={ourBranch}
            theirBranch={sourceBranch !== null ? sourceBranch.name : undefined}
            manualResolutions={manualResolutions}
            headerTitle="Resolve conflicts before cherry-picking"
            submitButton={submit}
            abortButton={abort}
            onSubmit={this.onContinueCherryPick}
            onAbort={this.onAbortCherryPick}
            onDismissed={this.onConflictsDialogDismissed}
            openFileInExternalEditor={openFileInExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
            someConflictsHaveBeenResolved={this.setConflictsHaveBeenResolved}
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
      case CherryPickStepKind.CreateBranch:
        const {
          allBranches,
          defaultBranch,
          upstreamDefaultBranch,
          upstreamGhRepo,
          tip,
          targetBranchName,
        } = step

        const okButtonText = __DARWIN__
          ? 'Create Branch and Cherry-pick'
          : 'Create branch and cherry-pick'

        const headerText = __DARWIN__
          ? 'Cherry-pick to New Branch'
          : 'Cherry-pick to new branch'

        return (
          <CreateBranch
            key="create-branch"
            tip={tip}
            defaultBranch={defaultBranch}
            upstreamDefaultBranch={upstreamDefaultBranch}
            upstreamGitHubRepository={upstreamGhRepo}
            allBranches={allBranches}
            repository={this.props.repository}
            onDismissed={this.onFlowEnded}
            dispatcher={this.props.dispatcher}
            initialName={targetBranchName}
            createBranch={this.onCreateBranchAndCherryPick}
            okButtonText={okButtonText}
            headerText={headerText}
          />
        )
      case CherryPickStepKind.HideConflicts:
        // no ui for this part of flow
        return null
      default:
        return assertNever(step, 'Unknown cherry-pick step found')
    }
  }
}
