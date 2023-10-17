import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { Banner } from './banner'

interface ISuccessBannerProps {
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
    return (
      <button onClick={this.undo} autoFocus={true}>
        Undo
      </button>
    )
  }

  public render() {
    return (
      <Banner id="successful" onDismissed={this.props.onDismissed}>
        <div className="green-circle">
          <Octicon className="check-icon" symbol={OcticonSymbol.check} />
        </div>
        <div className="banner-message">
          <span className="success-contents">{this.props.children}</span>
          {this.renderUndo()}
        </div>
      </Banner>
    )
  }
}
