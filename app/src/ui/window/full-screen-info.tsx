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

const transitionAppearDuration = 100
const transitionLeaveDuration = 250
const holdDuration = 3000

/**
 * A component which displays the status and fullscreen keyboard shortcut
 * when the window becomes fullscreen. This component is rendered on top of all
 * other content (except for dialogs, we can't put ourselves on top of dialogs
 * easily at the moment).
 */
export class FullScreenInfo extends React.Component<
  IFullScreenInfoProps,
  IFullScreenInfoState
> {
  private infoDisappearTimeoutId: number | null = null
  private transitionGroupDisappearTimeoutId: number | null = null

  public constructor(props: IFullScreenInfoProps) {
    super(props)

    this.state = {
      renderInfo: false,
      renderTransitionGroup: false,
    }
  }

  public componentWillReceiveProps(nextProps: IFullScreenInfoProps) {
    // If the window state hasn't change we don't have to do anything
    if (nextProps.windowState === this.props.windowState) {
      return
    }

    // Clean up any stray timeout
    if (this.infoDisappearTimeoutId !== null) {
      window.clearTimeout(this.infoDisappearTimeoutId)
    }

    if (this.transitionGroupDisappearTimeoutId !== null) {
      window.clearTimeout(this.transitionGroupDisappearTimeoutId)
    }

    if (nextProps.windowState === 'full-screen') {
      this.infoDisappearTimeoutId = window.setTimeout(
        this.onInfoDisappearTimeout,
        holdDuration
      )

      this.transitionGroupDisappearTimeoutId = window.setTimeout(
        this.onTransitionGroupDisappearTimeout,
        transitionAppearDuration + holdDuration + transitionLeaveDuration
      )

      this.setState({
        renderTransitionGroup: true,
        renderInfo: true,
      })
    } else if (this.state.renderInfo || this.state.renderTransitionGroup) {
      // We're no longer in full-screen, let's get rid of the notification
      // immediately without any transitions.
      this.setState({
        renderTransitionGroup: false,
        renderInfo: false,
      })
    }
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
        transitionAppearTimeout={transitionAppearDuration}
        transitionLeaveTimeout={transitionLeaveDuration}
      >
        {this.renderFullScreenNotification()}
      </CSSTransitionGroup>
    )
  }
}
