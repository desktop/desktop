import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { timeout } from '../../lib/promise'
import { getResolvedFiles } from '../../lib/status'
import { formatRebaseValue } from '../../lib/rebase'
import { RebaseResult, getCommitsInRange } from '../../lib/git'
import { RebaseConflictState } from '../../lib/app-state'

import { Repository } from '../../models/repository'
import { RebaseStep, RebaseFlowState } from '../../models/rebase-flow-state'
import { RebaseProgressSummary } from '../../models/rebase'
import { IRebaseProgress } from '../../models/progress'
import { WorkingDirectoryStatus } from '../../models/status'

import { Dispatcher } from '../dispatcher'

import { ChooseBranchDialog } from './choose-branch'
import { ShowConflictedFilesDialog } from './show-conflicted-files-dialog'
import { RebaseProgressDialog } from './progress-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'
import { CommitOneLine } from '../../models/commit'

interface IRebaseFlowProps {
  /**
   * Starting point for the rebase flow - may be choosing a branch or starting
   * from conflicts
   */
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
  readonly onFlowEnded: () => void

  /**
   * Callbacks for the conflict selection components to let the user jump out
   * to their preferred editor.
   */
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

interface IRebaseFlowState {
  /** The current step in the rebase flow */
  readonly step: RebaseFlowState

  /**
   * Tracking the tip of the repository when conflicts were last resolved to
   * ensure the flow returns to displaying conflicts only when the rebase
   * proceeds, and not as a side-effect of other prop changes.
   */
  readonly lastResolvedConflictsTip: string | null

  /** Progress information about the current rebase */
  readonly progress: RebaseProgressSummary

  /**
   * Track whether the user has done work to resolve conflicts as part of this
   * rebase, as the component should confirm with the user that they wish to
   * abort the rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean
}

/** A component for initiating and performing a rebase of the current branch. */
export class RebaseFlow extends React.Component<
  IRebaseFlowProps,
  IRebaseFlowState
> {
  public constructor(props: IRebaseFlowProps) {
    super(props)

    this.state = {
      step: props.initialState,
      lastResolvedConflictsTip: null,
      progress: {
        value: 0,
        rebasedCommitCount: 0,
        commits: [],
      },
      userHasResolvedConflicts: false,
    }
  }

  public async componentDidUpdate() {
    if (this.state.step.kind === RebaseStep.ShowProgress) {
      // if we encounter new conflicts, transition to the resolve conflicts step
      const { conflictState } = this.props
      if (
        conflictState !== null &&
        this.state.lastResolvedConflictsTip !== conflictState.currentTip
      ) {
        const { workingDirectory } = this.props
        const { manualResolutions, targetBranch } = conflictState

        this.setState({
          lastResolvedConflictsTip: null,
          step: {
            kind: RebaseStep.ShowConflicts,
            targetBranch,
            workingDirectory,
            manualResolutions,
          },
        })
      } else if (this.state.progress.value >= 1) {
        // waiting before the CSS animation to give the progress UI a chance to
        // show it reaches 100%
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
    // this ensures the progress bar fills to 100%, while `componentDidUpdate`
    // detects and handles the state transition after a period of time to ensure
    // the UI shows _something_ before closing the dialog
    this.setState(prevState => {
      const { commits } = prevState.progress
      return {
        progress: {
          ...progress,
          commits,
        },
      }
    })
  }

  private moveToCompletedState = () => {
    // this ensures the progress bar fills to 100%, while `componentDidUpdate`
    // detects and handles the state transition after a period of time to ensure
    // the UI shows _something_ before closing the dialog
    this.setState(prevState => {
      const { commits } = prevState.progress
      const rebasedCommitCount = commits.length
      return {
        progress: {
          value: 1,
          rebasedCommitCount,
          commits,
        },
      }
    })
  }

  private onStartRebase = async (
    baseBranch: string,
    targetBranch: string,
    totalCommitCount: number
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
          rebasedCommitCount: 0,
          totalCommitCount,
          progressCallback: this.updateProgress,
        }
      )

      if (result === RebaseResult.CompletedWithoutError) {
        this.moveToCompletedState()
      }
    }

    // TODO:
    // clean this up in https://github.com/desktop/desktop/pull/7167 as
    // the commits will be checked in the ChooseBranch step and passed into
    // here to start the rebase
    let commits: ReadonlyArray<CommitOneLine> = []

    try {
      commits = await getCommitsInRange(
        this.props.repository,
        baseBranch,
        targetBranch
      )
    } catch (err) {
      log.warn(
        `Unexpected error while getting commits that will be part of the rebase`,
        err
      )
    }

    this.setState(() => ({
      step: {
        kind: RebaseStep.ShowProgress,
        rebaseAction: startRebaseAction,
      },
      progress: {
        value: 0,
        rebasedCommitCount: 1,
        totalCommitCount,

        commits,
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

    // set the know conflict tip state before continuing the rebase
    this.setState({
      lastResolvedConflictsTip: conflictState.currentTip,
    })

    const continueRebaseAction = async () => {
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
      const { rebasedCommitCount, commits } = prevState.progress

      const newCount = rebasedCommitCount + 1
      const newProgressValue = newCount / commits.length
      const value = formatRebaseValue(newProgressValue)

      return {
        step: {
          kind: RebaseStep.ShowProgress,
          rebaseAction: continueRebaseAction,
        },
        progress: {
          value,
          rebasedCommitCount: newCount,
          commits,
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
    const { targetBranch } = this.state.step

    this.setState(
      {
        step: { kind: RebaseStep.HideConflicts },
      },
      () => {
        this.props.onShowRebaseConflictsBanner(
          this.props.repository,
          targetBranch
        )
      }
    )
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
        return (
          <RebaseProgressDialog
            progress={this.state.progress}
            rebaseAction={step.rebaseAction}
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
