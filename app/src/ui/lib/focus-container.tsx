import * as React from 'react'
import * as classNames from 'classnames'

interface IFocusContainerProps {
  readonly className?: string
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
}

interface IFocusContainerState {
  readonly focusInside: boolean
}

export class FocusContainer extends React.Component<
  IFocusContainerProps,
  IFocusContainerState
> {
  private wrapperRef: HTMLDivElement | null = null

  public constructor(props: IFocusContainerProps) {
    super(props)
    this.state = { focusInside: false }
  }

  private onWrapperRef = (elem: HTMLDivElement) => {
    if (elem) {
      elem.addEventListener('focusin', () => {
        this.setState({ focusInside: true })
      })

      elem.addEventListener('focusout', () => {
        this.setState({ focusInside: false })
      })
    }

    this.wrapperRef = elem
  }

  private onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (this.props.onClick) {
      this.props.onClick(e)
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
      'focus-inside': this.state.focusInside,
    })

    return (
      <div
        className={className}
        ref={this.onWrapperRef}
        onClick={this.onClick}
        onMouseDown={this.onMouseDown}
      >
        {this.props.children}
      </div>
    )
  }
}
