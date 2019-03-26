import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { timeout } from '../../lib/promise'
import { getResolvedFiles } from '../../lib/status'
import { formatRebaseValue } from '../../lib/rebase'
import { RebaseResult } from '../../lib/git'
import { RebaseConflictState } from '../../lib/app-state'

import { Repository } from '../../models/repository'
import { RebaseStep, RebaseFlowState } from '../../models/rebase-flow-state'
import { BannerType } from '../../models/banner'
import { IRebaseProgress } from '../../models/progress'
import { WorkingDirectoryStatus } from '../../models/status'

import { Dispatcher } from '../dispatcher'

import { ChooseBranchDialog } from './choose-branch'
import { ShowConflictedFilesDialog } from './show-conflicted-files-dialog'
import { RebaseProgressDialog } from './progress-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'

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

  /**
   * A flag to track whether the user has done work as part of this rebase,
   * as the component should confirm with the user that they wish to abort
   * the rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean
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
      userHasResolvedConflicts: false,
    }
  }

  public async componentDidUpdate(prevProps: IRebaseFlowProps) {
    if (this.state.step.kind === RebaseStep.ShowProgress) {
      const oldConflictState = prevProps.conflictState
      const newConflictState = this.props.conflictState

      if (oldConflictState === null && newConflictState !== null) {
        const { workingDirectory } = this.props
        const { manualResolutions, targetBranch } = newConflictState

        this.setState({
          step: {
            kind: RebaseStep.ShowConflicts,
            targetBranch,
            workingDirectory,
            manualResolutions,
          },
        })
      } else if (this.state.progress.value >= 1) {
        // waiting before the CSS animation to give the progress UI a chance to show
        // it reaches 100%
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
    }

    if (
      this.state.step.kind === RebaseStep.ShowConflicts &&
      // skip re-running this check once any resolved files have been detected
      !this.state.userHasResolvedConflicts
    ) {
      const { workingDirectory, conflictState } = this.props

      if (conflictState === null) {
        // no conflicts found, ignoring
        return
      }

      const resolvedConflicts = getResolvedFiles(
        workingDirectory,
        conflictState.manualResolutions
      )

      if (resolvedConflicts.length > 0) {
        this.setState({
          userHasResolvedConflicts: true,
        })
      }
    }
  }

  private moveToShowConflictedFileState = () => {
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
    const { title, value, commitSummary, total, count } = progress
    log.info(`got progress: '${title}' '${value}' '${commitSummary}'`)

    this.setState({
      progress: {
        value,
        commitSummary,
        count,
        total,
      },
    })
  }

  private moveToCompletedState = () => {
    // this ensures the progress bar fills to 100%, while componentDidUpdate
    // handles the state transition after a period of time to ensure the UI
    // shows _something_ before closing the dialog
    this.setState(prevState => {
      const { total } = prevState.progress
      return {
        progress: {
          value: 1,
          count: total,
          total,
        },
      }
    })
  }

  private onStartRebase = (
    baseBranch: string,
    targetBranch: string,
    total: number
  ) => {
    if (this.state.step.kind !== RebaseStep.ChooseBranch) {
      throw new Error(`Invalid step to start rebase: ${this.state.step.kind}`)
    }

    const startRebaseAction = async () => {
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

      if (result === RebaseResult.CompletedWithoutError) {
        this.moveToCompletedState()
      }
    }

    this.setState(() => ({
      step: {
        kind: RebaseStep.ShowProgress,
        onDidMount: startRebaseAction,
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

    const continueRebaseInner = async () => {
      const result = await this.props.dispatcher.continueRebase(
        this.props.repository,
        this.props.workingDirectory,
        conflictState.manualResolutions
      )

      if (result === RebaseResult.CompletedWithoutError) {
        this.moveToCompletedState()
      }
    }

    this.setState(prevState => {
      const { total, count } = prevState.progress

      const newCount = count + 1
      const progress = newCount / total
      const value = formatRebaseValue(progress)

      return {
        step: {
          kind: RebaseStep.ShowProgress,
          onDidMount: continueRebaseInner,
        },
        progress: {
          value,
          count: newCount,
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
      onOpenDialog: async () => {
        await this.moveToShowConflictedFileState()
      },
    })
  }

  private onConfirmAbortRebase = async () => {
    if (!this.state.userHasResolvedConflicts) {
      await this.onAbortRebase()
      return
    }

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
          log.error(
            '[RebaseFlow] unable to find conflicts for this repository despite being in conflicted state'
          )
          log.error(
            '[RebaseFlow] ending rebase flow as user has likely made changes to the repository from the command line'
          )
          this.props.onFlowEnded()
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
