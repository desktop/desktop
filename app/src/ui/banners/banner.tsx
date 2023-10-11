import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IBannerProps {
  readonly id?: string
  readonly timeout?: number
  readonly dismissable?: boolean
  readonly onDismissed: () => void
}

interface IBannerState {
  readonly contentSuffix?: string
}

export class Banner extends React.Component<IBannerProps, IBannerState> {
  private visibilityTimeoutId: number | null = null
  private contentTimeoutId: number | null = null

  public constructor(props: IBannerProps) {
    super(props)

    this.state = {
      contentSuffix: '\u00A0',
    }
  }

  public render() {
    return (
      <div
        id={this.props.id}
        className="banner"
        aria-atomic="true"
        role="alert"
      >
        <div className="contents">{this.props.children}</div>
        {this.state.contentSuffix}
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
        <button
          onClick={this.props.onDismissed}
          aria-label="Dismiss this message"
        >
          <Octicon symbol={OcticonSymbol.x} />
        </button>
      </div>
    )
  }

  public componentDidMount = () => {
    if (this.props.timeout !== undefined) {
      this.visibilityTimeoutId = window.setTimeout(() => {
        this.props.onDismissed()
      }, this.props.timeout)
    }

    this.contentTimeoutId = window.setTimeout(() => {
      this.setState({ contentSuffix: '\u00A0\u00A0' })
    }, 200)
  }

  public componentWillUnmount = () => {
    if (this.props.timeout !== undefined && this.visibilityTimeoutId !== null) {
      window.clearTimeout(this.visibilityTimeoutId)
    }

    if (this.contentTimeoutId !== null) {
      window.clearTimeout(this.contentTimeoutId)
    }
  }
}
