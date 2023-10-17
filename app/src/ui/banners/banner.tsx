import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IBannerProps {
  readonly id?: string
  readonly dismissable?: boolean
  readonly onDismissed: () => void
}

export class Banner extends React.Component<IBannerProps, {}> {
  private contents = React.createRef<HTMLDivElement>()
  private closeButton = React.createRef<HTMLButtonElement>()
  private focusTimeoutId: number | null = null

  public render() {
    return (
      <div
        id={this.props.id}
        className="banner"
        aria-atomic="true"
        role="alert"
      >
        <div className="contents" ref={this.contents}>
          {this.props.children}
        </div>
        {this.renderCloseButton()}
      </div>
    )
  }

  private renderCloseButton() {
    const { dismissable } = this.props

    if (dismissable === false) {
      return null
    }

    return (
      <div className="close">
        <button
          onClick={this.props.onDismissed}
          aria-label="Dismiss this message"
          ref={this.closeButton}
        >
          <Octicon symbol={OcticonSymbol.x} />
        </button>
      </div>
    )
  }

  public componentDidMount(): void {
    this.focusTimeoutId = window.setTimeout(() => {
      if (this.closeButton.current) {
        this.closeButton.current.focus()
      } else {
        this.contents.current?.querySelector('a')?.focus()
      }
    }, 200)
  }

  public componentWillUnmount(): void {
    if (this.focusTimeoutId !== null) {
      window.clearTimeout(this.focusTimeoutId)
    }
  }
}
