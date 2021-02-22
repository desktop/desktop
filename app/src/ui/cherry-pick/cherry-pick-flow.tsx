import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { Branch } from '../../models/branch'
import {
  CherryPickFlowStep,
  CherryPickStepKind,
  ShowConflictsStep,
} from '../../models/cherry-pick'
import { ICherryPickProgress } from '../../models/progress'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ChooseTargetBranchDialog } from './choose-target-branch'
import { CherryPickProgressDialog } from './cherry-pick-progress-dialog'
import { CommitOneLine } from '../../models/commit'
import { CherryPickConflictsDialog } from './cherry-pick-conflicts-dialog'
import { WorkingDirectoryStatus } from '../../models/status'

interface ICherryPickFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly step: CherryPickFlowStep
  readonly commits: CommitOneLine[]
  readonly progress: ICherryPickProgress | null
  readonly emoji: Map<string, string>

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
}

/** A component for initiating and performing a cherry pick. */
export class CherryPickFlow extends React.Component<ICherryPickFlowProps> {
  private onFlowEnded = () => {
    this.props.onDismissed()
  }

  private onCherryPick = (targetBranch: Branch) => {
    this.props.dispatcher.startCherryPick(
      this.props.repository,
      targetBranch,
      this.props.commits
    )
  }

  private onContinueCherryPick = (step: ShowConflictsStep) => {
    // TODO: dispatch to continue the cherry pick
  }

  private onAbortCherryPick = (step: ShowConflictsStep) => {
    // TODO: dispatch to abort the cherry pick
  }

  private showCherryPickConflictsBanner = (step: ShowConflictsStep) => {
    // TODO: dispatch to show cherry pick conflicts banner
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
            onCherryPick={this.onCherryPick}
            onDismissed={this.onFlowEnded}
          />
        )
      }
      case CherryPickStepKind.ShowProgress:
        if (this.props.progress === null) {
          log.error(
            `[CherryPickFlow] cherry pick progress should not be null
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
        } = this.props

        return (
          <CherryPickConflictsDialog
            dispatcher={dispatcher}
            repository={repository}
            step={step}
            userHasResolvedConflicts={userHasResolvedConflicts}
            workingDirectory={workingDirectory}
            onDismissed={this.onFlowEnded}
            onContinueCherryPick={this.onContinueCherryPick}
            onAbortCherryPick={this.onAbortCherryPick}
            showCherryPickConflictsBanner={this.showCherryPickConflictsBanner}
            openFileInExternalEditor={openFileInExternalEditor}
            resolvedExternalEditor={resolvedExternalEditor}
            openRepositoryInShell={openRepositoryInShell}
          />
        )
      default:
        return assertNever(step, 'Unknown cherry pick step found')
    }
  }
}
