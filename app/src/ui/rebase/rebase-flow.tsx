import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { timeout } from '../../lib/promise'
import { getResolvedFiles } from '../../lib/status'
import { RebaseResult, getCommitsInRange } from '../../lib/git'
import { RebaseConflictState } from '../../lib/app-state'

import { Repository } from '../../models/repository'
import { RebaseStep, RebaseFlowState } from '../../models/rebase-flow-state'
import { RebaseProgressSummary, RebasePreview } from '../../models/rebase'
import { WorkingDirectoryStatus } from '../../models/status'
import { CommitOneLine } from '../../models/commit'
import { Branch } from '../../models/branch'
import { ComputedAction } from '../../models/computed-action'

import { Dispatcher } from '../dispatcher'

import { ChooseBranchDialog } from './choose-branch'
import { ShowConflictedFilesDialog } from './show-conflicted-files-dialog'
import { RebaseProgressDialog } from './progress-dialog'
import { ConfirmAbortDialog } from './confirm-abort-dialog'

interface IRebaseFlowProps {
  /**
   * Starting point for the rebase flow - may be choosing a branch or starting
   * from conflicts
   */
  readonly initialState: RebaseFlowState

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

  /** Git progress information about the current rebase */
  readonly progress: RebaseProgressSummary

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
  /**
   * The current step in the rebase flow, containing application-specific
   * state needed for the UI components.
   */
  readonly step: RebaseFlowState

  /**
   * A preview of the rebase, using the selected base branch to test whether the
   * current branch will be cleanly applied.
   */
  readonly rebasePreview: RebasePreview | null

  /**
   * Track whether the user has done work to resolve conflicts as part of this
   * rebase, as the component should confirm with the user that they wish to
   * abort the rebase and lose that work.
   */
  readonly userHasResolvedConflicts: boolean

  /**
   * Tracking the tip of the repository when conflicts were last resolved to
   * ensure the flow returns to displaying conflicts only when the rebase
   * proceeds, and not as a side-effect of other prop changes.
   */
  readonly lastResolvedConflictsTip: string | null
}

/** A component for initiating and performing a rebase of the current branch. */
export class RebaseFlow extends React.Component<
  IRebaseFlowProps,
  IRebaseFlowState
> {
  private ignoreUpdateEvents = false

  public constructor(props: IRebaseFlowProps) {
    super(props)

    this.state = {
      step: props.initialState,
      lastResolvedConflictsTip: null,
      // progress: {
      //   value: 0,
      //   rebasedCommitCount: 0,
      //   commits: [],
      // },
      userHasResolvedConflicts: false,
      rebasePreview: null,
    }
  }

  public componentWillUnmount() {
    this.ignoreUpdateEvents = true
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
            previousProgress: null,
          },
        })
      } else if (this.props.progress.value >= 1) {
        // waiting before the CSS animation to give the progress UI a chance to
        // show it reaches 100%
        await timeout(1000)

        if (this.ignoreUpdateEvents) {
          return
        }

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

  private testRebaseOperation = (baseBranch: Branch) => {
    const { step } = this.state
    if (step.kind !== RebaseStep.ChooseBranch) {
      log.warn(`[RebaseFlow] testRebaseOperation invoked but on the wrong step`)
      return
    }

    this.setState(
      () => ({
        rebasePreview: {
          kind: ComputedAction.Loading,
        },
      }),
      async () => {
        const commits = await getCommitsInRange(
          this.props.repository,
          baseBranch.tip.sha,
          step.currentBranch.tip.sha
        )

        // TODO: in what situations might this not be possible to compute

        // TODO: check if this is a fast-forward (i.e. the selected branch is
        //       a direct descendant of the base branch) because this is a
        //       trivial rebase

        // TODO: generate the patches associated with these commits and see if
        //       they will apply to the base branch - if it fails, there will be
        //       conflicts to come

        this.setState(() => ({
          rebasePreview: {
            kind: ComputedAction.Clean,
            commits,
          },
        }))
      }
    )
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
        previousProgress: null,
      },
    })
  }

  private moveToCompletedState = () => {
    if (this.ignoreUpdateEvents) {
      return
    }

    // this ensures the progress bar fills to 100%, while `componentDidUpdate`
    // detects and handles the state transition after a period of time to ensure
    // the UI shows _something_ before closing the dialog
    this.setState(prevState => {
      // let currentCommitSummary: string | undefined = undefined

      // const { rebasePreview: rebaseStatus } = prevState

      // if (rebaseStatus !== null && rebaseStatus.kind === ComputedAction.Clean) {
      //   const { commits } = rebaseStatus
      //   if (commits.length > 0) {
      //     const last = commits.length - 1
      //     currentCommitSummary = commits[last].summary
      //   }
      // }

      //const { commits } = prevState.progress
      return {
        // progress: {
        //   value: 1,
        //   currentCommitSummary,
        //   rebasedCommitCount: commits.length,
        //   commits,
        // },
      }
    })
  }

  private onStartRebase = async (
    baseBranch: string,
    targetBranch: string,
    commits: ReadonlyArray<CommitOneLine>
  ) => {
    if (this.state.step.kind !== RebaseStep.ChooseBranch) {
      throw new Error(`Invalid step to start rebase: ${this.state.step.kind}`)
    }

    const startRebaseAction = async () => {
      const result = await this.props.dispatcher.rebase(
        this.props.repository,
        baseBranch,
        targetBranch,
        commits
      )

      if (result === RebaseResult.CompletedWithoutError) {
        this.moveToCompletedState()
      }
    }

    this.setState(() => {
      // const currentCommitSummary =
      //   commits.length > 0 ? commits[0].summary : undefined

      // const rebasedCommitCount = 1
      // const newProgressValue = rebasedCommitCount / commits.length

      return {
        step: {
          kind: RebaseStep.ShowProgress,
          rebaseAction: startRebaseAction,
        },
        // progress: {
        //   commits,
        //   value: formatRebaseValue(newProgressValue),
        //   rebasedCommitCount,
        //   currentCommitSummary,
        // },
      }
    })
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

    // TODO: where should this progress updating occur now?

    this.setState(() => {
      //const { rebasedCommitCount, commits } = prevProps.progress

      //const newCount = rebasedCommitCount + 1
      //const newProgressValue = newCount / commits.length
      //const value = formatRebaseValue(newProgressValue)

      // const currentCommitSummary =
      //   newCount <= commits.length ? commits[newCount - 1].summary : undefined

      return {
        step: {
          kind: RebaseStep.ShowProgress,
          rebaseAction: continueRebaseAction,
        },
        // progress: {
        //   value,
        //   rebasedCommitCount: newCount,
        //   commits,
        //   currentCommitSummary,
        // },
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
            onBranchChanged={this.testRebaseOperation}
            rebasePreviewStatus={this.state.rebasePreview}
          />
        )
      }
      case RebaseStep.ShowProgress:
        return (
          <RebaseProgressDialog
            progress={this.props.progress}
            emoji={this.props.emoji}
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
