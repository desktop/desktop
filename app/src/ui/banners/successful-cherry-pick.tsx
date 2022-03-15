import * as React from 'react'
import { formatCommitCount } from '../../lib/format-commit-count'
import { SuccessBanner } from './success-banner'

interface ISuccessfulCherryPickBannerProps {
  readonly targetBranchName: string
  readonly countCherryPicked: number
  readonly onDismissed: () => void
  readonly onUndo: () => void
}

export class SuccessfulCherryPick extends React.Component<
  ISuccessfulCherryPickBannerProps,
  {}
> {
  public render() {
    const {
      countCherryPicked,
      onDismissed,
      onUndo,
      targetBranchName,
    } = this.props

    return (
      <SuccessBanner timeout={15000} onDismissed={onDismissed} onUndo={onUndo}>
        <span>
          Successfully copied {formatCommitCount(countCherryPicked)} to{' '}
          <strong>{targetBranchName}</strong>.
        </span>
      </SuccessBanner>
    )
  }
}
