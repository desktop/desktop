import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

interface ISuccessBannerProps {
  readonly timeout: number
  readonly onDismissed: () => void
  readonly onUndo?: () => void
}

export class SuccessBanner extends React.Component<ISuccessBannerProps, {}> {
  private undo = () => {
    this.props.onDismissed()

    if (this.props.onUndo === undefined) {
      return
    }

    this.props.onUndo()
  }

  private renderUndo = () => {
    if (this.props.onUndo === undefined) {
      return
    }
    return <LinkButton onClick={this.undo}>Undo</LinkButton>
  }

  public render() {
    return (
      <Banner
        id="successful-cherry-pick"
        timeout={this.props.timeout}
        onDismissed={this.props.onDismissed}
      >
        <div className="green-circle">
          <Octicon className="check-icon" symbol={OcticonSymbol.check} />
        </div>
        <div className="banner-message">
          <span>
            {this.props.children}
            {this.renderUndo()}
          </span>
        </div>
      </Banner>
    )
  }
}
