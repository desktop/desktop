import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

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
      <Banner id="cherry-pick-undone" timeout={5000} onDismissed={onDismissed}>
        <div className="green-circle">
          <Octicon className="check-icon" symbol={OcticonSymbol.check} />
        </div>
        <div className="banner-message">
          <span>
            Cherry-pick undone. Successfully removed the {countCherryPicked}
            {' copied '}
            {pluralized} from <strong>{targetBranchName}</strong>.
          </span>
        </div>
      </Banner>
    )
  }
}
