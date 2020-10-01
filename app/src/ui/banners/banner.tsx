import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

interface IBannerProps {
  readonly id?: string
  readonly timeout?: number
  readonly dismissable?: boolean
  readonly onDismissed: () => void
}

export class Banner extends React.Component<IBannerProps, {}> {
  private timeoutId: number | null = null

  public render() {
    return (
      <div id={this.props.id} className="banner">
        <div className="contents">{this.props.children}</div>
        {this.renderCloseButton()}
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
        <a onClick={this.props.onDismissed}>
          <Octicon symbol={OcticonSymbol.x} />
        </a>
      </div>
    )
  }

  public componentDidMount = () => {
    if (this.props.timeout !== undefined) {
      this.timeoutId = window.setTimeout(() => {
        this.props.onDismissed()
      }, this.props.timeout)
    }
  }

  public componentWillUnmount = () => {
    if (this.props.timeout !== undefined && this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId)
    }
  }
}
