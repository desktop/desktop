import * as React from 'react'
import { SuccessBanner } from './success-banner'

interface ISuccessfulCherryPickBannerProps {
  readonly targetBranchName: string
  readonly countCherryPicked: number
  readonly onDismissed: () => void
  readonly onUndoCherryPick: () => void
}

export class SuccessfulCherryPick extends React.Component<
  ISuccessfulCherryPickBannerProps,
  {}
> {
  public render() {
    const {
      countCherryPicked,
      onDismissed,
      onUndoCherryPick,
      targetBranchName,
    } = this.props

    const pluralized = countCherryPicked === 1 ? 'commit' : 'commits'

    return (
      <SuccessBanner
        timeout={15000}
        onDismissed={onDismissed}
        onUndo={onUndoCherryPick}
      >
        <span>
          Successfully copied {countCherryPicked} {pluralized} to{' '}
          <strong>{targetBranchName}</strong>.
        </span>
      </SuccessBanner>
    )
  }
}
