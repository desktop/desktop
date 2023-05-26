import * as React from 'react'
import { formatCommitCount } from '../../lib/format-commit-count'
import { SuccessBanner } from './success-banner'

interface ISuccessfulSquashedBannerProps {
  readonly count: number
  readonly onDismissed: () => void
  readonly onUndo: () => void
}

export class SuccessfulSquash extends React.Component<
  ISuccessfulSquashedBannerProps,
  {}
> {
  public render() {
    const { count, onDismissed, onUndo } = this.props

    return (
      <SuccessBanner timeout={15000} onDismissed={onDismissed} onUndo={onUndo}>
        <span>Successfully squashed {formatCommitCount(count)}.</span>
      </SuccessBanner>
    )
  }
}
