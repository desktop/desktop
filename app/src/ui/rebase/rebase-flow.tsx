import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'

import { Repository } from '../../models/repository'
import {
  RebaseStep,
  RebaseFlowStep,
  ConfirmAbortStep,
} from '../../models/rebase-flow-step'
import { WorkingDirectoryStatus } from '../../models/status'

import { Dispatcher } from '../dispatcher'

import { ChooseBranchDialog } from './choose-branch'
import { RebaseProgressDialog } from './progress-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { getResolvedFiles } from '../../lib/status'
import { WarnForcePushDialog } from './warn-force-push-dialog'
import { ConflictsDialog } from '../multi-commit-operation/conflicts-dialog'
import { IMultiCommitOperationProgress } from '../../models/progress'

interface IRebaseFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /**
   * The current step in the rebase flow, containing application-specific
   * state needed for the UI components.
   */
  readonly step: RebaseFlowStep

  /** Git progress information about the current rebase */
  readonly progress: IMultiCommitOperationProgress | null

  /**
   * Track whether the user has done work to resolve conflicts as part of this
   * rebase, as the component should confirm with the user that they wish to
   * abort the rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean

  readonly askForConfirmationOnForcePush: boolean

  /**
   * Callback to hide the rebase flow and show a banner about the current state
   * of conflicts, because this component will be unmounted by the runtime.
   */
  readonly onShowRebaseConflictsBanner: (
    repository: Repository,
    targetBranch: string
  ) => void

  /**
   * Callback to fire to signal to the application that the rebase flow has
   * either ended in success or has been aborted and the flow can be closed.
   */
  readonly onFlowEnded: (repository: Repository) => void

  /**
   * Callbacks for the conflict selection components to let the user jump out
   * to their preferred editor.
   */
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
  readonly onDismissed: () => void
}

/** A component for initiating and performing a rebase of the current branch. */
export class RebaseFlow extends React.Component<IRebaseFlowProps> {
  private moveToShowConflictedFileState = (step: ConfirmAbortStep) => {
    const { conflictState } = step
    this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
      kind: RebaseStep.ShowConflicts,
      conflictState,
    })
  }

  private onContinueRebase = async () => {
    const { dispatcher, repository, workingDirectory, step } = this.props
    if (step.kind !== RebaseStep.ShowConflicts) {
      // This shouldn't happen, but needed the type checking.
      log.error(
        '[Rebase] Invoked continue of rebase without being in a conflict step.'
      )
      this.onFlowEnded()
      return
    }
    const { conflictState } = step

    const continueRebaseAction = async () => {
      const rebaseResult = await dispatcher.continueRebase(
        repository,
        workingDirectory,
        conflictState
      )
      return dispatcher.processContinueRebaseResult(
        rebaseResult,
        conflictState,
        repository
      )
    }

    return dispatcher.setRebaseFlowStep(repository, {
      kind: RebaseStep.ShowProgress,
      rebaseAction: continueRebaseAction,
    })
  }

  private onConflictsDialogDismissed = () => {
    const { dispatcher, repository, step } = this.props
    if (step.kind !== RebaseStep.ShowConflicts) {
      // This shouldn't happen, but needed the type checking.
      log.error(
        '[Rebase] Cannot show rebase conflict banner without being in a conflict step.'
      )
      this.onFlowEnded()
      return
    }

    dispatcher.setRebaseFlowStep(repository, {
      kind: RebaseStep.HideConflicts,
    })

    const { targetBranch } = step.conflictState

    this.props.onShowRebaseConflictsBanner(repository, targetBranch)
  }

  private onConfirmAbortRebase = async () => {
    const { workingDirectory, userHasResolvedConflicts, step } = this.props
    if (step.kind !== RebaseStep.ShowConflicts) {
      // This shouldn't happen, but needed the type checking.
      log.error(
        '[Rebase] Invoked abort of rebase without being in a conflict step.'
      )
      this.onFlowEnded()
      return
    }

    const { conflictState } = step
    const { manualResolutions } = conflictState

    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (userHasResolvedConflicts || resolvedConflicts.length > 0) {
      // a previous commit was resolved by the user
      this.props.dispatcher.setRebaseFlowStep(this.props.repository, {
        kind: RebaseStep.ConfirmAbort,
        conflictState,
      })
      return
    }

    return this.onAbortRebase()
  }

  private onAbortRebase = async () => {
    await this.props.dispatcher.abortRebase(this.props.repository)
    this.onFlowEnded()
  }

  private onFlowEnded = () => {
    this.props.onDismissed()
    this.props.onFlowEnded(this.props.repository)
  }

  private setConflictsHaveBeenResolved = () => {
    this.props.dispatcher.setConflictsResolved(this.props.repository)
  }

  private renderConflictsHeaderTitle(
    targetBranch: string,
    baseBranch?: string
  ) {
    const baseBranchOutput = (
      <>
        {' on '}
        <strong>{baseBranch}</strong>
      </>
    )

    return (
      <span>
        {`Resolve conflicts before rebasing `}
        <strong>{targetBranch}</strong>
        {baseBranch !== undefined && baseBranchOutput}
      </span>
    )
  }

  public render() {
    const { step } = this.props

    switch (step.kind) {
      case RebaseStep.ChooseBranch: {
        const { repository, dispatcher } = this.props
        const {
          allBranches,
          defaultBranch,
          currentBranch,
          recentBranches,
          initialBranch,
        } = step
        return (
          <ChooseBranchDialog
            key="choose-branch"
            repository={repository}
            dispatcher={dispatcher}
            allBranches={allBranches}
            defaultBranch={defaultBranch}
            recentBranches={recentBranches}
            currentBranch={currentBranch}
            initialBranch={initialBranch}
            onDismissed={this.onFlowEnded}
          />
        )
      }
      case RebaseStep.ShowProgress:
        const { progress, emoji } = this.props

        if (progress === null) {
          log.error(
            '[RebaseFlow] progress is null despite trying to show the progress view. Skipping rendering...'
          )
          return null
        }

        return <RebaseProgressDialog progress={progress} emoji={emoji} />
      case RebaseStep.ShowConflicts: {
        const {
          repository,
          resolvedExternalEditor,
          openFileInExternalEditor,
          openRepositoryInShell,
          dispatcher,
          workingDirectory,
          userHasResolvedConflicts,
        } = this.props

        const { conflictState } = step
        const { manualResolutions, targetBranch, baseBranch } = conflictState

        const submit = __DARWIN__ ? 'Continue Rebase' : 'Continue rebase'
        const abort = __DARWIN__ ? 'Abort Rebase' : 'Abort rebase'

        return (
          <ConflictsDialog
            dispatcher={dispatcher}
            repository={repository}
            workingDirectory={workingDirectory}
            userHasResolvedConflicts={userHasResolvedConflicts}
            resolvedExternalEditor={resolvedExternalEditor}
            ourBranch={baseBranch}
            theirBranch={targetBranch}
            manualResolutions={manualResolutions}
            headerTitle={this.renderConflictsHeaderTitle(
              targetBranch,
              baseBranch
            )}
            submitButton={submit}
            abortButton={abort}
            onSubmit={this.onContinueRebase}
            onAbort={this.onConfirmAbortRebase}
            onDismissed={this.onConflictsDialogDismissed}
            openFileInExternalEditor={openFileInExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
            someConflictsHaveBeenResolved={this.setConflictsHaveBeenResolved}
          />
        )
      }

      case RebaseStep.ConfirmAbort:
        return (
          <ConfirmAbortDialog
            step={step}
            onConfirmAbort={this.onAbortRebase}
            onReturnToConflicts={this.moveToShowConflictedFileState}
          />
        )
      case RebaseStep.WarnForcePush:
        const {
          repository,
          dispatcher,
          askForConfirmationOnForcePush,
        } = this.props

        return (
          <WarnForcePushDialog
            step={step}
            dispatcher={dispatcher}
            repository={repository}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onDismissed={this.onFlowEnded}
          />
        )

      case RebaseStep.HideConflicts:
      case RebaseStep.Completed:
        // there is no UI to display at this point in the flow
        return null
      default:
        return assertNever(step, 'Unknown rebase step found')
    }
  }
}
