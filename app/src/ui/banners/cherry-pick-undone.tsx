import * as React from 'react'
import { formatCommitCount } from '../../lib/format-commit-count'
import { SuccessBanner } from './success-banner'

interface ICherryPickUndoneBannerProps {
  readonly targetBranchName: string
  readonly countCherryPicked: number
  readonly onDismissed: () => void
}

export class CherryPickUndone extends React.Component<
  ICherryPickUndoneBannerProps,
  {}
> {
  public render() {
    const { countCherryPicked, targetBranchName, onDismissed } = this.props
    return (
      <SuccessBanner timeout={5000} onDismissed={onDismissed}>
        Cherry-pick undone. Successfully removed the{' '}
        {formatCommitCount(countCherryPicked, 'copied commit')}
        from <strong>{targetBranchName}</strong>.
      </SuccessBanner>
    )
  }
}
