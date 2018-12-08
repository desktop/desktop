import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

interface IBannerProps {
  readonly id?: string
  readonly timeout?: number
  readonly dismissable?: boolean
  readonly onDismissed: () => void
}

export class Banner extends React.Component<IBannerProps, {}> {
  private timeoutId: NodeJS.Timer | null = null

  public render() {
    const close =
      this.props.dismissable !== undefined &&
      this.props.dismissable === true ? (
        <div className="close">
          <a onClick={this.props.onDismissed}>
            <Octicon symbol={OcticonSymbol.x} />
          </a>
        </div>
      ) : null
    return (
      <div id={this.props.id} className="banner">
        <div className="contents">{this.props.children}</div>
        {close}
      </div>
    )
  }

  public componentDidMount = () => {
    if (this.props.timeout !== undefined) {
      this.timeoutId = setTimeout(() => {
        this.props.onDismissed()
      }, this.props.timeout)
    }
  }

  public componentWillUnmount = () => {
    if (this.props.timeout !== undefined && this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
    }
  }
}
