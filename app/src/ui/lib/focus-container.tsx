import * as React from 'react'
import * as classNames from 'classnames'

interface IFocusContainerProps {
  readonly className?: string
}

interface IFocusContainerState {
  readonly focusInside: boolean
}

export class FocusContainer extends React.Component<
  IFocusContainerProps,
  IFocusContainerState
> {
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
  }

  public render() {
    const className = classNames('focus-container', this.props.className, {
      'focus-inside': this.state.focusInside,
    })

    return (
      <div className={className} ref={this.onWrapperRef}>
        {this.props.children}
      </div>
    )
  }
}
