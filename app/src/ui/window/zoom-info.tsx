import * as React from 'react'
import { TransitionGroup, CSSTransition } from 'react-transition-group'

interface IZoomInfoProps {
  readonly windowZoomFactor: number
}

interface IZoomInfoState {
  readonly windowZoomFactor: number
  readonly renderTransitionGroup: boolean
  readonly renderInfo: boolean
  readonly transitionName: 'zoom-in' | 'zoom-out'
}

const transitionDuration = 100
const holdDuration = 750

/**
 * A component which displays the current zoom factor of the window
 * when it changes. This component is rendered on top of all other
 * content (except for dialogs, which we can't put ourselves on top of easily at
 * the moment, and the fullscreen notification.)
 */
export class ZoomInfo extends React.Component<IZoomInfoProps, IZoomInfoState> {
  private infoDisappearTimeoutId: number | null = null
  private transitionGroupDisappearTimeoutId: number | null = null

  public constructor(props: IZoomInfoProps) {
    super(props)

    this.state = {
      windowZoomFactor: props.windowZoomFactor,
      renderTransitionGroup: false,
      renderInfo: false,
      transitionName: 'zoom-in',
    }
  }

  public componentWillReceiveProps(nextProps: IZoomInfoProps) {
    const hasChanged =
      this.state.windowZoomFactor !== nextProps.windowZoomFactor

    if (!hasChanged) {
      return
    }

    if (this.infoDisappearTimeoutId !== null) {
      window.clearTimeout(this.infoDisappearTimeoutId)
    }

    if (this.transitionGroupDisappearTimeoutId !== null) {
      window.clearTimeout(this.transitionGroupDisappearTimeoutId)
    }

    this.infoDisappearTimeoutId = window.setTimeout(
      this.onInfoDisappearTimeout,
      holdDuration
    )

    this.transitionGroupDisappearTimeoutId = window.setTimeout(
      this.onTransitionGroupDisappearTimeout,
      transitionDuration + holdDuration + transitionDuration
    )

    const transitionName =
      nextProps.windowZoomFactor > this.state.windowZoomFactor
        ? 'zoom-in'
        : 'zoom-out'

    this.setState({
      windowZoomFactor: nextProps.windowZoomFactor,
      renderTransitionGroup: hasChanged,
      renderInfo: hasChanged,
      transitionName,
    })
  }

  private onInfoDisappearTimeout = () => {
    this.setState({ renderInfo: false })
  }

  private onTransitionGroupDisappearTimeout = () => {
    this.setState({ renderTransitionGroup: false })
  }

  private renderZoomInfo() {
    if (!this.state.renderInfo) {
      return null
    }

    const zoomPercent = `${(this.state.windowZoomFactor * 100).toFixed(0)}%`

    return (
      <CSSTransition
        classNames={this.state.transitionName}
        appear={true}
        enter={false}
        exit={true}
        timeout={transitionDuration}
      >
        <div>
          <span>{zoomPercent}</span>
        </div>
      </CSSTransition>
    )
  }

  public render() {
    if (!this.state.renderTransitionGroup) {
      return null
    }

    return (
      <TransitionGroup id="window-zoom-info">
        {this.renderZoomInfo()}
      </TransitionGroup>
    )
  }
}
