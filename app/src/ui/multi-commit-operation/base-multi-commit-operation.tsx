import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { Repository } from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'
import { Dispatcher } from '../dispatcher'
import { getResolvedFiles } from '../../lib/status'
import { ConflictState, IMultiCommitOperationState } from '../../lib/app-state'
import { Branch } from '../../models/branch'
import { MultiCommitOperationStepKind } from '../../models/multi-commit-operation'
import { ConflictsDialog } from './conflicts-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { ProgressDialog } from './progress-dialog'
import { WarnForcePushDialog } from './warn-force-push-dialog'

export interface IMultiCommitOperationProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The current state of the multi commit operation */
  readonly state: IMultiCommitOperationState

  /** The current state of conflicts in the app */
  readonly conflictState: ConflictState | null

  /** The emoji map for showing commit emoji's */
  readonly emoji: Map<string, string>

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /** Whether user should be warned about force pushing */
  readonly askForConfirmationOnForcePush: boolean

  /**
   * Callbacks for the conflict selection components to let the user jump out
   * to their preferred editor.
   */
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

/** A base component for the shared logic of multi commit operations. */
export abstract class BaseMultiCommitOperation extends React.Component<
  IMultiCommitOperationProps
> {
  protected abstract onBeginOperation = () => {}

  protected abstract onChooseBranch = (targetBranch: Branch) => {}

  protected abstract onContinueAfterConflicts = async (): Promise<void> => {}

  protected abstract onAbort = async (): Promise<void> => {}

  protected abstract onConflictsDialogDismissed = () => {}

  protected abstract renderChooseBranch = (): JSX.Element | null => {
    return null
  }

  protected abstract renderCreateBranch = (): JSX.Element | null => {
    return null
  }

  protected onFlowEnded = () => {
    this.props.dispatcher.closePopup()
    this.props.dispatcher.endMultiCommitOperation(this.props.repository)
  }

  /**
   * Method to call anytime we do state type checking that should pass but is
   * needed for typing purposes. Thus it should never happen, so throw error if
   * does.
   */
  protected endFlowInvalidState(): void {
    const { step, operationDetail } = this.props.state
    throw new Error(
      `[${operationDetail.kind}] - Invalid state - ${operationDetail.kind} ended during ${step}.`
    )
  }

  protected onInvokeConflictsDialogDismissed = (operationPrefix: string) => {
    const { repository, dispatcher, state } = this.props
    const { targetBranch, step } = state

    if (step.kind !== MultiCommitOperationStepKind.ShowConflicts) {
      this.endFlowInvalidState()
      return
    }

    const { conflictState } = step
    dispatcher.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.HideConflicts,
      conflictState,
    })

    const operationDescription = (
      <>
        {operationPrefix} <strong>{targetBranch.name}</strong>
      </>
    )
    return dispatcher.onConflictsFoundBanner(
      repository,
      operationDescription,
      conflictState
    )
  }

  private onConfirmingAbort = async (): Promise<void> => {
    const { repository, dispatcher, workingDirectory, state } = this.props
    const { userHasResolvedConflicts, step } = state

    if (step.kind !== MultiCommitOperationStepKind.ShowConflicts) {
      this.endFlowInvalidState()
      return
    }

    const { conflictState } = step
    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      conflictState.manualResolutions
    )

    if (userHasResolvedConflicts || resolvedConflicts.length > 0) {
      dispatcher.setMultiCommitOperationStep(repository, {
        kind: MultiCommitOperationStepKind.ConfirmAbort,
        conflictState,
      })
      return
    }

    return this.onAbort()
  }

  private moveToConflictState = () => {
    const { dispatcher, repository, state } = this.props
    const { step } = state
    if (step.kind !== MultiCommitOperationStepKind.ConfirmAbort) {
      this.endFlowInvalidState()
      return
    }

    const { conflictState } = step
    return dispatcher.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.ShowConflicts,
      conflictState,
    })
  }

  private setConflictsHaveBeenResolved = () => {
    this.props.dispatcher.setConflictsResolved(this.props.repository)
  }

  public render() {
    const { state } = this.props
    const { step } = state

    switch (step.kind) {
      case MultiCommitOperationStepKind.ChooseBranch: {
        return this.renderChooseBranch()
      }
      case MultiCommitOperationStepKind.ShowProgress:
        const { emoji } = this.props
        return (
          <ProgressDialog
            progress={state.progress}
            emoji={emoji}
            operation={state.operationDetail.kind}
          />
        )
      case MultiCommitOperationStepKind.ShowConflicts: {
        const {
          repository,
          resolvedExternalEditor,
          openFileInExternalEditor,
          openRepositoryInShell,
          dispatcher,
          workingDirectory,
          state,
        } = this.props

        const { userHasResolvedConflicts, operationDetail } = state
        const { manualResolutions, ourBranch, theirBranch } = step.conflictState

        const operation = __DARWIN__
          ? operationDetail.kind
          : operationDetail.kind.toLowerCase()
        const submit = `Continue ${operation}`
        const abort = `Abort ${operation}`

        return (
          <ConflictsDialog
            dispatcher={dispatcher}
            repository={repository}
            workingDirectory={workingDirectory}
            userHasResolvedConflicts={userHasResolvedConflicts}
            resolvedExternalEditor={resolvedExternalEditor}
            ourBranch={ourBranch}
            theirBranch={theirBranch}
            manualResolutions={manualResolutions}
            headerTitle={`Resolve conflicts before ${operationDetail.kind}`}
            submitButton={submit}
            abortButton={abort}
            onSubmit={this.onContinueAfterConflicts}
            onAbort={this.onConfirmingAbort}
            onDismissed={this.onConflictsDialogDismissed}
            openFileInExternalEditor={openFileInExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
            someConflictsHaveBeenResolved={this.setConflictsHaveBeenResolved}
          />
        )
      }
      case MultiCommitOperationStepKind.ConfirmAbort:
        return (
          <ConfirmAbortDialog
            operation={this.props.state.operationDetail.kind}
            onConfirmAbort={this.onAbort}
            onReturnToConflicts={this.moveToConflictState}
          />
        )
      case MultiCommitOperationStepKind.WarnForcePush:
        const { dispatcher, askForConfirmationOnForcePush } = this.props
        return (
          <WarnForcePushDialog
            operation={state.operationDetail.kind}
            dispatcher={dispatcher}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onBegin={this.onBeginOperation}
            onDismissed={this.onFlowEnded}
          />
        )
      case MultiCommitOperationStepKind.CreateBranch:
        return this.renderCreateBranch()
      case MultiCommitOperationStepKind.HideConflicts:
        return null
      default:
        return assertNever(
          step,
          `Unknown multi commit operation step found: ${step}`
        )
    }
  }
}
