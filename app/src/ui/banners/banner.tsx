import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IBannerProps {
  readonly id?: string
  readonly dismissable?: boolean
  readonly onDismissed: () => void
}

export class Banner extends React.Component<IBannerProps, {}> {
  public render() {
    return (
      <div
        id={this.props.id}
        className="banner"
        aria-atomic="true"
        role="alert"
      >
        {this.renderCloseButton()}
        <div className="contents">{this.props.children}</div>
      </div>
    )
  }

  private renderCloseButton() {
    const { dismissable } = this.props
    if (dismissable === undefined || dismissable === false) {
      return null
    }

    return (
      <div className="close">
        <button
          onClick={this.props.onDismissed}
          aria-label="Dismiss this message"
          autoFocus={true}
        >
          <Octicon symbol={OcticonSymbol.x} />
        </button>
      </div>
    )
  }
}
