import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
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
        id="successful"
        timeout={this.props.timeout}
        onDismissed={this.props.onDismissed}
      >
        <div className="green-circle">
          <Octicon className="check-icon" symbol={octicons.checkCircleFill} />
        </div>
        <div className="banner-message">
          <span className="success-contents">{this.props.children}</span>
          {this.renderUndo()}
        </div>
      </Banner>
    )
  }
}
