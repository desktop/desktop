import * as React from 'react'
import { CSSTransitionGroup } from 'react-transition-group'
import { WindowState } from '../../lib/window-state'

interface IFullScreenInfoProps {
  readonly windowState: WindowState
}

interface IFullScreenInfoState {
  readonly renderInfo: boolean
  readonly renderTransitionGroup: boolean
}

const transitionDuration = 100
const holdDuration = 3000

export class FullScreenInfo extends React.Component<
  IFullScreenInfoProps,
  IFullScreenInfoState
> {
  private infoDisappearTimeoutId: number | null = null
  private transitionGroupDisappearTimeoutId: number | null = null

  public constructor() {
    super()

    this.state = {
      renderInfo: false,
      renderTransitionGroup: false,
    }
  }

  public componentWillReceiveProps(nextProps: IFullScreenInfoProps) {
    // Have we entered into full screen?
    const hasEnteredFullScreen =
      nextProps.windowState === 'full-screen' &&
      this.props.windowState !== 'full-screen'

    // If we haven't we don't have to do anything
    if (!hasEnteredFullScreen) {
      return
    }

    // Since we have we'll clear all timeouts and present a notification
    if (this.infoDisappearTimeoutId !== null) {
      clearTimeout(this.infoDisappearTimeoutId)
    }

    if (this.transitionGroupDisappearTimeoutId !== null) {
      clearTimeout(this.transitionGroupDisappearTimeoutId)
    }

    this.infoDisappearTimeoutId = window.setTimeout(
      this.onInfoDisappearTimeout,
      holdDuration
    )

    this.transitionGroupDisappearTimeoutId = window.setTimeout(
      this.onTransitionGroupDisappearTimeout,
      holdDuration + transitionDuration
    )

    this.setState({
      renderTransitionGroup: true,
      renderInfo: true,
    })
  }

  private onInfoDisappearTimeout = () => {
    this.setState({ renderInfo: false })
  }

  private onTransitionGroupDisappearTimeout = () => {
    this.setState({ renderTransitionGroup: false })
  }

  private renderFullScreenNotification() {
    if (!this.state.renderInfo) {
      return null
    }

    const kbdShortcut = __DARWIN__ ? '⌃⌘F' : 'F11'

    return (
      <div key="notification" className="toast-notification">
        Press <kbd>{kbdShortcut}</kbd> to exit fullscreen
      </div>
    )
  }

  public render() {
    if (!this.state.renderTransitionGroup) {
      return null
    }

    return (
      <CSSTransitionGroup
        className="toast-notification-container"
        transitionName="toast-animation"
        component="div"
        transitionAppear={true}
        transitionEnter={false}
        transitionLeave={true}
        transitionAppearTimeout={transitionDuration}
        transitionLeaveTimeout={transitionDuration}
      >
        {this.renderFullScreenNotification()}
      </CSSTransitionGroup>
    )
  }
}
