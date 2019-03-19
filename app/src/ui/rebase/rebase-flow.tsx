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
import { IChangesState } from '../../lib/app-state'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { IRebaseProgress } from '../../models/progress'

interface IRebaseFlowProps {
  /** Starting point for the rebase flow */
  readonly initialState: RebaseFlowState

  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** Snapshot of changes in the current repository */
  readonly changesState: IChangesState

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
  readonly rebaseFlow: RebaseFlowState
}

/** A component for initating a rebase of the current branch. */
export class RebaseFlow extends React.Component<
  IRebaseFlowProps,
  IRebaseFlowState
> {
  public constructor(props: IRebaseFlowProps) {
    super(props)

    this.state = {
      rebaseFlow: props.initialState,
    }
  }

  private showConflictedFiles = () => {
    const { changesState } = this.props

    const { workingDirectory, conflictState } = changesState

    if (conflictState === null || conflictState.kind === 'merge') {
      log.error('[RebaseFlow] unable to detect conflicts for this repository')
      return
    }

    const { manualResolutions, targetBranch } = conflictState

    this.setState({
      rebaseFlow: {
        step: RebaseStep.ShowConflicts,
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
      rebaseFlow: {
        step: RebaseStep.ShowProgress,
        value,
        count,
        total,
        commitSummary,
      },
    })
  }

  private moveToCompletedState = () => {
    setTimeout(() => {
      this.setState({
        rebaseFlow: {
          step: RebaseStep.Completed,
        },
      })
      this.props.onFlowEnded()
    }, 1000)
  }

  private onStartRebase = (
    baseBranch: string,
    targetBranch: string,
    total: number
  ) => {
    if (this.state.rebaseFlow.step === RebaseStep.ChooseBranch) {
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
              rebaseFlow: {
                step: RebaseStep.ShowProgress,
                count: total,
                total,
                commitSummary: null,
                value: 1,
              },
            },
            () => this.moveToCompletedState()
          )
        }
      }

      this.setState({
        rebaseFlow: {
          step: RebaseStep.ShowProgress,
          value: 0,
          count: 1,
          total,
          // TODO:
          // this doesn't feel great to workaround the issue, but we don't see
          // the commit summary from Git until after it's been applied, but maybe
          // if I can get the list of commits that should be rebased on top of
          // the base branch I can pass that in here?
          commitSummary: null,
          actionToRun,
        },
      })
    } else {
      throw new Error(
        `Invalid step to start rebase: ${this.state.rebaseFlow.step}`
      )
    }
  }

  private showRebaseConflictsBanner = () => {
    if (this.state.rebaseFlow.step === RebaseStep.ShowConflicts) {
      this.setState({
        rebaseFlow: { step: RebaseStep.HideConflicts },
      })

      const { targetBranch } = this.state.rebaseFlow

      this.props.dispatcher.setBanner({
        type: BannerType.RebaseConflictsFound,
        targetBranch,
        onOpenDialog: () => {
          this.showConflictedFiles()
        },
      })
    } else {
      throw new Error(
        `Invalid step to show rebase conflicts banner: ${
          this.state.rebaseFlow.step
        }`
      )
    }
  }

  private onConfirmAbortRebase = () => {
    // TODO: if no files resolved during rebase, skip this entire process and
    //       just abort the rebase

    const { changesState } = this.props
    const { conflictState } = changesState

    if (conflictState === null || conflictState.kind === 'merge') {
      throw new Error('Unable to resolve conflict state for this repository')
    }

    const { targetBranch, baseBranch } = conflictState

    this.setState({
      rebaseFlow: {
        step: RebaseStep.ConfirmAbort,
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
    const { rebaseFlow } = this.state

    switch (rebaseFlow.step) {
      case RebaseStep.ChooseBranch: {
        const { repository, onFlowEnded } = this.props
        const {
          allBranches,
          defaultBranch,
          currentBranch,
          recentBranches,
          initialBranch,
        } = rebaseFlow
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
        const { value, count, total, commitSummary } = rebaseFlow

        return (
          <RebaseProgressDialog
            value={value}
            count={count}
            total={total}
            commitSummary={commitSummary}
            actionToRun={rebaseFlow.actionToRun}
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
        } = this.props

        const {
          targetBranch,
          baseBranch,
          workingDirectory,
          manualResolutions,
        } = rebaseFlow

        return (
          <ShowConflictedFilesDialog
            key="view-conflicts"
            repository={repository}
            onDismissed={onFlowEnded}
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
      case RebaseStep.HideConflicts:
        // TODO
        return null
      case RebaseStep.ConfirmAbort:
        const { targetBranch, baseBranch } = rebaseFlow
        return (
          <ConfirmAbortDialog
            onConfirmAbort={this.onAbortRebase}
            onReturnToConflicts={this.showConflictedFiles}
            targetBranch={targetBranch}
            baseBranch={baseBranch}
          />
        )
      case RebaseStep.Completed:
        // TODO
        return null
      default:
        return assertNever(rebaseFlow, 'Unknown rebase step found')
    }
  }
}
