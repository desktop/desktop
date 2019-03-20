import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { Repository } from '../../models/repository'

import { RebaseStep, RebaseFlowState } from '../../models/rebase-flow-state'

import { ChooseBranchDialog } from './choose-branch'
import { ShowConflictedFilesDialog } from './show-conflicted-files-dialog'
import { Dispatcher } from '../dispatcher'
import { RebaseProgressDialog } from './progress-dialog'
import { BannerType } from '../../models/banner'
import { RebaseResult } from '../../lib/git'
import { RebaseConflictState } from '../../lib/app-state'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { IRebaseProgress } from '../../models/progress'
import { WorkingDirectoryStatus } from '../../models/status'
import { clamp } from '../../lib/clamp'
import { timeout } from '../../lib/promise'

interface IRebaseFlowProps {
  /** Starting point for the rebase flow */
  readonly initialState: RebaseFlowState

  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /**
   * Snapshot of conflicts in the current repository
   *
   * Will be `null` while the rebase is in progress but has not encountered
   * conflicts.
   */
  readonly conflictState: RebaseConflictState | null

  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void

  /**
   * Callback to fire to signal to the application that the rebase flow has
   * either ended in success or has been aborted and the flow can be closed.
   */
  readonly onFlowEnded: () => void
}

interface IRebaseFlowState {
  readonly step: RebaseFlowState

  readonly progress: {
    /** A numeric value between 0 and 1 representing the rebase progress */
    readonly value: number
    /** Track the current number of commits rebased across dialogs and states */
    readonly count: number
    /** Track the total number of commits to rebase across dialog and states */
    readonly total: number
    /** The commit summary associated with the current commit (if known) */
    readonly commitSummary?: string
  }
}

/** A component for initating a rebase of the current branch. */
export class RebaseFlow extends React.Component<
  IRebaseFlowProps,
  IRebaseFlowState
> {
  public constructor(props: IRebaseFlowProps) {
    super(props)

    this.state = {
      step: props.initialState,
      progress: {
        value: 0,
        count: 0,
        total: 0,
      },
    }
  }

  private showConflictedFiles = () => {
    const { workingDirectory, conflictState } = this.props

    if (conflictState === null) {
      log.error('[RebaseFlow] unable to detect conflicts for this repository')
      return
    }

    const { manualResolutions, targetBranch } = conflictState

    this.setState({
      step: {
        kind: RebaseStep.ShowConflicts,
        targetBranch,
        workingDirectory,
        manualResolutions,
      },
    })
  }

  private updateProgress = (progress: IRebaseProgress) => {
    // TODO: this can happen very quickly for a trivial rebase or an OS with
    // fast I/O - are we able to artificially slow this down so there's some
    // semblance of progress before it moves to "completed"?

    const { title, value, commitSummary, total, count } = progress
    log.info(`got progress: '${title}' '${value}' '${commitSummary}'`)

    this.setState({
      step: {
        kind: RebaseStep.ShowProgress,
      },
      progress: {
        value,
        commitSummary,
        count,
        total,
      },
    })
  }

  private moveToCompletedState = async () => {
    await timeout(1000)

    this.setState(
      {
        step: {
          kind: RebaseStep.Completed,
        },
      },
      () => this.props.onFlowEnded()
    )
  }

  private onStartRebase = (
    baseBranch: string,
    targetBranch: string,
    total: number
  ) => {
    if (this.state.step.kind !== RebaseStep.ChooseBranch) {
      throw new Error(`Invalid step to start rebase: ${this.state.step.kind}`)
    }

    const actionToRun = async () => {
      const result = await this.props.dispatcher.rebase(
        this.props.repository,
        baseBranch,
        targetBranch,
        {
          start: 0,
          total,
          progressCallback: this.updateProgress,
        }
      )

      if (result === RebaseResult.ConflictsEncountered) {
        await this.props.dispatcher.loadStatus(this.props.repository)

        this.showConflictedFiles()
      } else if (result === RebaseResult.CompletedWithoutError) {
        this.setState(
          {
            step: {
              kind: RebaseStep.ShowProgress,
              commitSummary: null,
              value: 1,
            },
          },
          () => this.moveToCompletedState()
        )
      }
    }

    this.setState(() => ({
      step: {
        kind: RebaseStep.ShowProgress,
        actionToRun,
      },
      progress: {
        value: 0,
        count: 1,
        total,
      },
    }))
  }

  private onContinueRebase = async () => {
    if (this.state.step.kind !== RebaseStep.ShowConflicts) {
      throw new Error(
        `Invalid step to continue rebase rebase: ${this.state.step.kind}`
      )
    }

    const { conflictState } = this.props
    if (conflictState === null) {
      throw new Error(`No conflicted files found, unable to continue rebase`)
    }

    const actionToRun = async () => {
      const result = await this.props.dispatcher.continueRebase(
        this.props.repository,
        this.props.workingDirectory,
        conflictState.manualResolutions
      )

      if (result === RebaseResult.ConflictsEncountered) {
        await this.props.dispatcher.loadStatus(this.props.repository)

        this.showConflictedFiles()
      } else if (result === RebaseResult.CompletedWithoutError) {
        this.setState(
          prevState => {
            const { total } = prevState.progress

            return {
              step: {
                kind: RebaseStep.ShowProgress,
              },
              progress: {
                count: total,
                total,
                value: 1,
              },
            }
          },
          () => this.moveToCompletedState()
        )
      }
    }

    this.setState(prevState => {
      const { total, count } = prevState.progress

      // move to next commit to signal progress
      const newCount = count + 1
      const progress = newCount / total
      // TODO: should this live up in GitRebaseParser?
      const value = Math.round(clamp(progress, 0, 1) * 100) / 100

      return {
        step: {
          kind: RebaseStep.ShowProgress,
          actionToRun,
        },
        progress: {
          value,
          count: count + 1,
          total,
        },
      }
    })
  }

  private showRebaseConflictsBanner = () => {
    if (this.state.step.kind !== RebaseStep.ShowConflicts) {
      throw new Error(
        `Invalid step to show rebase conflicts banner: ${this.state.step.kind}`
      )
    }
    this.setState({
      step: { kind: RebaseStep.HideConflicts },
    })

    const { targetBranch } = this.state.step

    this.props.dispatcher.setBanner({
      type: BannerType.RebaseConflictsFound,
      targetBranch,
      onOpenDialog: () => {
        this.showConflictedFiles()
      },
    })
  }

  private onConfirmAbortRebase = () => {
    // TODO: if no files resolved during rebase, skip this entire process and
    //       just abort the rebase

    const { conflictState } = this.props

    if (conflictState === null) {
      throw new Error('Unable to resolve conflict state for this repository')
    }

    const { targetBranch, baseBranch } = conflictState

    this.setState({
      step: {
        kind: RebaseStep.ConfirmAbort,
        targetBranch,
        baseBranch,
      },
    })
  }

  private onAbortRebase = async () => {
    await this.props.dispatcher.abortRebase(this.props.repository)
    this.props.onFlowEnded()
  }

  public render() {
    const { step } = this.state

    switch (step.kind) {
      case RebaseStep.ChooseBranch: {
        const { repository, onFlowEnded } = this.props
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
            onDismissed={onFlowEnded}
            onStartRebase={this.onStartRebase}
          />
        )
      }
      case RebaseStep.ShowProgress:
        const { onDidMount } = step
        const { value, count, total, commitSummary } = this.state.progress

        return (
          <RebaseProgressDialog
            value={value}
            count={count}
            total={total}
            commitSummary={commitSummary}
            onDidMount={onDidMount}
            onDismissed={this.props.onFlowEnded}
          />
        )
      case RebaseStep.ShowConflicts: {
        const {
          repository,
          onFlowEnded,
          resolvedExternalEditor,
          openFileInExternalEditor,
          openRepositoryInShell,
          dispatcher,
          workingDirectory,
          conflictState,
        } = this.props

        if (conflictState === null) {
          log.error('[RebaseFlow] unable to find conflicts for this repository')
          return null
        }

        const { manualResolutions } = conflictState
        const { targetBranch, baseBranch } = step

        return (
          <ShowConflictedFilesDialog
            key="view-conflicts"
            repository={repository}
            onDismissed={onFlowEnded}
            onContinueRebase={this.onContinueRebase}
            dispatcher={dispatcher}
            showRebaseConflictsBanner={this.showRebaseConflictsBanner}
            targetBranch={targetBranch}
            baseBranch={baseBranch}
            workingDirectory={workingDirectory}
            manualResolutions={manualResolutions}
            resolvedExternalEditor={resolvedExternalEditor}
            openFileInExternalEditor={openFileInExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
            onAbortRebase={this.onConfirmAbortRebase}
          />
        )
      }

      case RebaseStep.ConfirmAbort:
        const { targetBranch, baseBranch } = step
        return (
          <ConfirmAbortDialog
            onConfirmAbort={this.onAbortRebase}
            onReturnToConflicts={this.showConflictedFiles}
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
