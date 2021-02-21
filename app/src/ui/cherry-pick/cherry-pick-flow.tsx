import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { Branch } from '../../models/branch'
import {
  CherryPickFlowStep,
  CherryPickStepKind,
} from '../../models/cherry-pick'
import { ICherryPickProgress } from '../../models/progress'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ChooseTargetBranchDialog } from './choose-target-branch'
import { CherryPickProgressDialog } from './cherry-pick-progress-dialog'

interface ICherryPickFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly step: CherryPickFlowStep
  readonly progress: ICherryPickProgress | null
  readonly emoji: Map<string, string>

  readonly onDismissed: () => void
}

/** A component for initiating and performing a cherry pick. */
export class CherryPickFlow extends React.Component<ICherryPickFlowProps> {
  private onFlowEnded = () => {
    this.props.onDismissed()
  }

  private onCherryPick = (targetBranch: Branch) => {
    // TODO: call this.props.dispatcher.cherryPick
    this.props.onDismissed()
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
      default:
        return assertNever(step, 'Unknown cherry pick step found')
    }
  }
}
