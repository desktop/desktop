import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { RebaseConflictState } from '../../lib/app-state'

import { Repository } from '../../models/repository'
import {
  RebaseStep,
  RebaseFlowStep,
  ShowConflictsStep,
} from '../../models/rebase-flow-step'
import { GitRebaseProgress, RebasePreview } from '../../models/rebase'
import { WorkingDirectoryStatus } from '../../models/status'
import { CommitOneLine } from '../../models/commit'
import { Branch } from '../../models/branch'

import { Dispatcher } from '../dispatcher'

import { ChooseBranchDialog } from './choose-branch'
import { ShowConflictedFilesDialog } from './show-conflicted-files-dialog'
import { RebaseProgressDialog } from './progress-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { getResolvedFiles } from '../../lib/status'

interface IRebaseFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /**
   * Snapshot of conflicts in the current repository
   *
   * Will be `null` while the rebase is in progress but has not encountered
   * conflicts.
   */
  readonly conflictState: RebaseConflictState | null

  /**
   * The current step in the rebase flow, containing application-specific
   * state needed for the UI components.
   */
  readonly step: RebaseFlowStep

  /**
   * A preview of the rebase, using the selected base branch to test whether the
   * current branch will be cleanly applied.
   */
  readonly preview: RebasePreview | null

  /** Git progress information about the current rebase */
  readonly progress: GitRebaseProgress | null

  /**
   * Track whether the user has done work to resolve conflicts as part of this
   * rebase, as the component should confirm with the user that they wish to
   * abort the rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean

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
}

/** A component for initiating and performing a rebase of the current branch. */
export class RebaseFlow extends React.Component<IRebaseFlowProps> {
  public constructor(props: IRebaseFlowProps) {
    super(props)

    this.state = {
      userHasResolvedConflicts: false,
    }
  }

  private testRebaseOperation = (baseBranch: Branch) => {
    const { step } = this.props
    if (step.kind !== RebaseStep.ChooseBranch) {
      log.warn(`[RebaseFlow] testRebaseOperation invoked but on the wrong step`)
      return
    }

    this.props.dispatcher.previewRebase(
      this.props.repository,
      baseBranch,
      step.currentBranch
    )
  }

  private moveToShowConflictedFileState = () => {
    const { conflictState } = this.props

    if (conflictState === null) {
      log.error('[RebaseFlow] unable to detect conflicts for this repository')
      return
    }

    this.props.dispatcher.setRebaseFlow(this.props.repository, {
      kind: RebaseStep.ShowConflicts,
      conflictState,
    })
  }

  private onStartRebase = async (
    baseBranch: string,
    targetBranch: string,
    commits: ReadonlyArray<CommitOneLine>
  ) => {
    if (this.props.step.kind !== RebaseStep.ChooseBranch) {
      throw new Error(`Invalid step to start rebase: ${this.props.step.kind}`)
    }

    this.props.dispatcher.initializeRebaseProgress(
      this.props.repository,
      commits
    )

    const startRebaseAction = () => {
      return this.props.dispatcher.rebase(
        this.props.repository,
        baseBranch,
        targetBranch
      )
    }

    this.props.dispatcher.setRebaseFlow(this.props.repository, {
      kind: RebaseStep.ShowProgress,
      rebaseAction: startRebaseAction,
    })
  }

  private onContinueRebase = async () => {
    if (this.props.step.kind !== RebaseStep.ShowConflicts) {
      throw new Error(
        `Invalid step to continue rebase rebase: ${this.props.step.kind}`
      )
    }

    const { conflictState } = this.props
    if (conflictState === null) {
      throw new Error(`No conflicted files found, unable to continue rebase`)
    }

    const continueRebaseAction = () => {
      return this.props.dispatcher.continueRebase(
        this.props.repository,
        this.props.workingDirectory,
        conflictState.manualResolutions
      )
    }

    this.props.dispatcher.setRebaseFlow(this.props.repository, {
      kind: RebaseStep.ShowProgress,
      rebaseAction: continueRebaseAction,
    })
  }

  private showRebaseConflictsBanner = (step: ShowConflictsStep) => {
    this.props.dispatcher.setRebaseFlow(this.props.repository, {
      kind: RebaseStep.HideConflicts,
    })

    const { targetBranch } = step.conflictState

    this.props.onShowRebaseConflictsBanner(this.props.repository, targetBranch)
  }

  private onConfirmAbortRebase = (step: ShowConflictsStep) => {
    const { workingDirectory, userHasResolvedConflicts } = this.props
    const { manualResolutions, targetBranch, baseBranch } = step.conflictState

    if (userHasResolvedConflicts) {
      // a previous commit was resolved by the user
      this.props.dispatcher.setRebaseFlow(this.props.repository, {
        kind: RebaseStep.ConfirmAbort,
        targetBranch,
        baseBranch,
      })
      return
    }

    // otherwise check the current commit for resolved changes
    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (resolvedConflicts.length > 0) {
      this.props.dispatcher.setRebaseFlow(this.props.repository, {
        kind: RebaseStep.ConfirmAbort,
        targetBranch,
        baseBranch,
      })
    } else {
      this.onAbortRebase()
    }
  }

  private onAbortRebase = async () => {
    await this.props.dispatcher.abortRebase(this.props.repository)
    this.onFlowEnded()
  }

  private onFlowEnded = () => {
    this.props.onFlowEnded(this.props.repository)
  }

  public render() {
    const { step } = this.props

    switch (step.kind) {
      case RebaseStep.ChooseBranch: {
        const { repository } = this.props
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
            allBranches={allBranches}
            defaultBranch={defaultBranch}
            recentBranches={recentBranches}
            currentBranch={currentBranch}
            initialBranch={initialBranch}
            onDismissed={this.onFlowEnded}
            onStartRebase={this.onStartRebase}
            onBranchChanged={this.testRebaseOperation}
            rebasePreviewStatus={this.props.preview}
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
          conflictState,
          userHasResolvedConflicts,
        } = this.props

        if (conflictState === null) {
          log.error(
            '[RebaseFlow] unable to find conflicts for this repository despite being in conflicted state'
          )
          log.error(
            '[RebaseFlow] ending rebase flow as user has likely made changes to the repository from the command line'
          )
          this.onFlowEnded()
          return null
        }

        return (
          <ShowConflictedFilesDialog
            key="view-conflicts"
            repository={repository}
            dispatcher={dispatcher}
            step={step}
            showRebaseConflictsBanner={this.showRebaseConflictsBanner}
            conflictState={conflictState}
            workingDirectory={workingDirectory}
            userHasResolvedConflicts={userHasResolvedConflicts}
            resolvedExternalEditor={resolvedExternalEditor}
            openFileInExternalEditor={openFileInExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
            onAbortRebase={this.onConfirmAbortRebase}
            onDismissed={this.onFlowEnded}
            onContinueRebase={this.onContinueRebase}
          />
        )
      }

      case RebaseStep.ConfirmAbort:
        const { targetBranch, baseBranch } = step
        return (
          <ConfirmAbortDialog
            onConfirmAbort={this.onAbortRebase}
            onReturnToConflicts={this.moveToShowConflictedFileState}
            targetBranch={targetBranch}
            baseBranch={baseBranch}
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
