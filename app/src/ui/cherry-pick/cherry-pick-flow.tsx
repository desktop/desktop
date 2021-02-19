import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'
import { Branch } from '../../models/branch'
import { CherryPickFlowStep, CherryPickStep } from '../../models/cherry-pick'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ChooseTargetBranchDialog } from './choose-target-branch'

interface ICherryPickFlowProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly step: CherryPickFlowStep

  readonly onDismissed: () => void
}

/** A component for initiating and performing a cherry pick. */
export class CherryPickFlow extends React.Component<ICherryPickFlowProps> {
  private onFlowEnded = () => {
    this.props.onDismissed()
  }

  private onCherryPick(targetBranch: Branch) {
    // TODO: call this.props.dispatcher.cherryPick
    this.props.onDismissed()
  }

  public render() {
    const { step } = this.props

    switch (step.kind) {
      case CherryPickStep.ChooseTargetBranch: {
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
      default:
        return assertNever(step.kind, 'Unknown cherry pick step found')
    }
  }
}
