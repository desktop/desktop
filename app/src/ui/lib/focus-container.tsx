import * as React from 'react'
import * as classNames from 'classnames'

interface IFocusContainerProps {
  readonly className?: string
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

interface IFocusContainerState {
  readonly focusWithin: boolean
}

/**
 * A helper component which appends a classname to a wrapper
 * element if any of its descendant nodes currently has
 * keyboard focus.
 *
 * In other words it's a little workaround that lets use
 * use `:focus-within`
 *   https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-within
 * even though it's not supported in our current version
 * of chromium (it'll be in 60 or 61 depending on who you trust)
 */
export class FocusContainer extends React.Component<
  IFocusContainerProps,
  IFocusContainerState
> {
  private wrapperRef: HTMLDivElement | null = null

  public constructor(props: IFocusContainerProps) {
    super(props)
    this.state = { focusWithin: false }
  }

  private onWrapperRef = (elem: HTMLDivElement) => {
    if (elem) {
      elem.addEventListener('focusin', () => {
        this.setState({ focusWithin: true })
      })

      elem.addEventListener('focusout', () => {
        this.setState({ focusWithin: false })
      })
    }

    this.wrapperRef = elem
  }

  private onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (this.props.onClick) {
      this.props.onClick(e)
    }
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(e)
    }
  }

  private onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If someone is clicking on the focuscontainer itself we'll
    // cancel it, that saves us from having a focusout/in cycle
    // and a janky focus ring toggle.
    if (e.target === this.wrapperRef) {
      e.preventDefault()
    }
  }

  public render() {
    const className = classNames('focus-container', this.props.className, {
      'focus-within': this.state.focusWithin,
    })

    return (
      <div
        className={className}
        ref={this.onWrapperRef}
        onClick={this.onClick}
        onMouseDown={this.onMouseDown}
        onKeyDown={this.onKeyDown}
      >
        {this.props.children}
      </div>
    )
  }
}
