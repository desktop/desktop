import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import { Repository } from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'
import { Dispatcher } from '../dispatcher'
import { getResolvedFiles, getConflictedFiles } from '../../lib/status'
import { ConflictState, IMultiCommitOperationState } from '../../lib/app-state'
import { Branch } from '../../models/branch'
import { MultiCommitOperationStepKind } from '../../models/multi-commit-operation'
import { ConflictsDialog } from './dialog/conflicts-dialog'
import { ConfirmAbortDialog } from './dialog/confirm-abort-dialog'
import { ProgressDialog } from './dialog/progress-dialog'
import { WarnForcePushDialog } from './dialog/warn-force-push-dialog'
import { CopilotConflictsLoadingDialog } from './dialog/copilot-conflicts-loading-dialog'
import { CopilotConflictsDialog } from './dialog/copilot-conflicts-dialog'
import { PopupType } from '../../models/popup'
import { BannerType } from '../../models/banner'
import { Account } from '../../models/account'
import { IAPIRepoRuleset } from '../../lib/api'
import { Emoji } from '../../lib/emoji'
import { IConflictResolutionModelDisplay } from '../../lib/copilot/conflict-resolution-model'

export interface IMultiCommitOperationProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The current state of the multi commit operation */
  readonly state: IMultiCommitOperationState

  /** The current state of conflicts in the app */
  readonly conflictState: ConflictState | null

  /** The emoji map for showing commit emoji's */
  readonly emoji: Map<string, Emoji>

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /** Whether user should be warned about force pushing */
  readonly askForConfirmationOnForcePush: boolean

  // react/no-unused-prop-types doesn't understand abstract classes and
  // thinks these are unused but they are used in the subclasses.
  // eslint-disable-next-line react/no-unused-prop-types
  readonly accounts: ReadonlyArray<Account>

  // eslint-disable-next-line react/no-unused-prop-types
  readonly cachedRepoRulesets: ReadonlyMap<number, IAPIRepoRuleset>

  /**
   * Whether to show the "New" call-to-action bubble on the
   * "Resolve with Copilot" entry button. False after the user has
   * clicked the button at least once.
   */
  readonly shouldShowCopilotConflictResolutionCallOut: boolean

  /**
   * The model name and reasoning effort to display while Copilot resolves
   * conflicts, reflecting the user's `conflict-resolution` model selection.
   */
  readonly copilotConflictResolutionModel: IConflictResolutionModelDisplay

  /**
   * Callbacks for the conflict selection components to let the user jump out
   * to their preferred editor.
   */
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

/** A base component for the shared logic of multi commit operations. */
export abstract class BaseMultiCommitOperation extends React.Component<IMultiCommitOperationProps> {
  protected abstract onBeginOperation: () => void
  protected abstract onChooseBranch: (targetBranch: Branch) => void
  protected abstract onContinueAfterConflicts: () => Promise<void>
  protected abstract onAbort: () => Promise<void>
  protected abstract onConflictsDialogDismissed: () => void
  protected abstract renderChooseBranch: () => JSX.Element | null
  protected abstract renderCreateBranch: () => JSX.Element | null

  /** Initiate Copilot conflict resolution for the current operation. */
  protected onResolveWithCopilot = () => {
    const { dispatcher, repository, state } = this.props
    const { step } = state

    if (step.kind !== MultiCommitOperationStepKind.ShowConflicts) {
      this.endFlowInvalidState()
      return
    }

    // Pre-flight handles account check, first-click tracking, and the
    // AI-tool disclaimer (shown on first use + every 30 days). On clean
    // pass it transitions to the loading step and runs the resolution.
    dispatcher.attemptCopilotConflictResolution(repository)
  }

  protected onFlowEnded = () => {
    this.props.dispatcher.closePopup(PopupType.MultiCommitOperation)
    this.props.dispatcher.endMultiCommitOperation(this.props.repository)
  }

  /**
   * Method to call anytime we reach an unexpected state during a multi-commit
   * operation. Closes the dialog, logs the error, and reports to telemetry.
   */
  protected endFlowInvalidState(): void {
    const { step, operationDetail } = this.props.state
    const errorMessage = `[${operationDetail.kind}] - Invalid state - ${operationDetail.kind} ended during ${step.kind}.`
    this.onFlowEnded()
    log.error(errorMessage)
    sendNonFatalException('multiCommitOperation', new Error(errorMessage))
  }

  protected onInvokeConflictsDialogDismissed = (operationPrefix: string) => {
    const { repository, dispatcher, state } = this.props
    const { targetBranch, step } = state

    if (
      step.kind !== MultiCommitOperationStepKind.ShowConflicts &&
      step.kind !== MultiCommitOperationStepKind.ShowCopilotConflicts &&
      step.kind !== MultiCommitOperationStepKind.ShowCopilotConflictsLoading
    ) {
      this.endFlowInvalidState()
      return
    }

    const { conflictState } = step

    const operationDescription = (
      <>
        {operationPrefix}{' '}
        {targetBranch !== null ? <strong>{targetBranch.name}</strong> : null}
      </>
    )

    // For Copilot steps, just close the popup and show a banner that
    // reopens it. Don't change the step — resolution continues in the
    // background and the step updates naturally when it finishes.
    if (
      step.kind === MultiCommitOperationStepKind.ShowCopilotConflictsLoading ||
      step.kind === MultiCommitOperationStepKind.ShowCopilotConflicts
    ) {
      dispatcher.closePopup(PopupType.MultiCommitOperation)
      dispatcher.setBanner({
        type: BannerType.ConflictsFound,
        operationDescription,
        onOpenConflictsDialog: () => {
          dispatcher.showPopup({
            type: PopupType.MultiCommitOperation,
            repository,
          })
        },
      })
      return
    }

    dispatcher.setMultiCommitOperationStep(repository, {
      kind: MultiCommitOperationStepKind.HideConflicts,
      conflictState,
    })

    this.props.dispatcher.closePopup(PopupType.MultiCommitOperation)
    return dispatcher.onConflictsFoundBanner(
      repository,
      operationDescription,
      conflictState
    )
  }

  private onConfirmingAbort = async (): Promise<void> => {
    const { repository, dispatcher, workingDirectory, state } = this.props
    const { userHasResolvedConflicts, step } = state

    if (
      step.kind !== MultiCommitOperationStepKind.ShowConflicts &&
      step.kind !== MultiCommitOperationStepKind.ShowCopilotConflicts &&
      step.kind !== MultiCommitOperationStepKind.ShowCopilotConflictsLoading
    ) {
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
        returnToStepKind: step.kind,
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

    const { conflictState, returnToStepKind } = step
    // Honor the step the user was on when they entered ConfirmAbort so
    // that returning from "Abort" doesn't strand an in-flight Copilot
    // resolution by routing them to ShowCopilotConflicts before the
    // result has landed in state.
    const stepKind =
      returnToStepKind ??
      (state.useCopilotConflictResolution
        ? MultiCommitOperationStepKind.ShowCopilotConflicts
        : MultiCommitOperationStepKind.ShowConflicts)
    return dispatcher.setMultiCommitOperationStep(repository, {
      kind: stepKind,
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
            accounts={this.props.accounts}
            shouldShowCopilotConflictResolutionCallOut={
              this.props.shouldShowCopilotConflictResolutionCallOut
            }
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
            onResolveWithCopilot={this.onResolveWithCopilot}
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
      case MultiCommitOperationStepKind.ShowCopilotConflictsLoading: {
        const conflictedFiles = getConflictedFiles(
          this.props.workingDirectory,
          step.conflictState.manualResolutions
        )
        return (
          <CopilotConflictsLoadingDialog
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            conflictState={step.conflictState}
            conflictedFilePaths={conflictedFiles.map(f => f.path)}
            progress={this.props.state.copilotResolutionProgress}
            operationKind={this.props.state.operationDetail.kind}
            model={this.props.copilotConflictResolutionModel}
            onAbort={this.onConfirmingAbort}
            onDismissed={this.onConflictsDialogDismissed}
          />
        )
      }
      case MultiCommitOperationStepKind.ShowCopilotConflicts:
        return (
          <CopilotConflictsDialog
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            conflictState={step.conflictState}
            workingDirectory={this.props.workingDirectory}
            operationKind={this.props.state.operationDetail.kind}
            copilotResolutions={this.props.state.copilotResolutions}
            copilotResolutionSummary={this.props.state.copilotResolutionSummary}
            model={
              this.props.state.copilotResolutionModel ??
              this.props.copilotConflictResolutionModel
            }
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            onContinueAfterConflicts={this.onContinueAfterConflicts}
            onAbort={this.onConfirmingAbort}
            onDismissed={this.onConflictsDialogDismissed}
            emoji={this.props.emoji}
          />
        )
      default:
        return assertNever(
          step,
          `Unknown multi commit operation step found: ${step}`
        )
    }
  }
}
