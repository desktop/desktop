import * as React from 'react'
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
    const pluralized = countCherryPicked === 1 ? 'commit' : 'commits'
    return (
      <SuccessBanner timeout={5000} onDismissed={onDismissed}>
        Cherry-pick undone. Successfully removed the {countCherryPicked}
        {' copied '}
        {pluralized} from <strong>{targetBranchName}</strong>.
      </SuccessBanner>
    )
  }
}
