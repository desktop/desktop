import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

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
  private undo = () => {
    this.props.onDismissed()
    this.props.onUndoCherryPick()
  }

  public render() {
    const { countCherryPicked, onDismissed, targetBranchName } = this.props

    const pluralized = countCherryPicked === 1 ? 'commit' : 'commits'
    return (
      <Banner
        id="successful-cherry-pick"
        timeout={15000}
        onDismissed={onDismissed}
      >
        <div className="green-circle">
          <Octicon className="check-icon" symbol={OcticonSymbol.check} />
        </div>
        <div className="banner-message">
          <span>
            Successfully copied {countCherryPicked} {pluralized} to{' '}
            <strong>{targetBranchName}</strong>.{' '}
            <LinkButton onClick={this.undo}>Undo</LinkButton>
          </span>
        </div>
      </Banner>
    )
  }
}
