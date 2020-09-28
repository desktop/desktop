import * as React from 'react'
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import { WindowState } from '../../lib/window-state'

interface IFullScreenInfoProps {
  // react-unused-props-and-state doesn't understand getDerivedStateFromProps
  // tslint:disable-next-line:react-unused-props-and-state
  readonly windowState: WindowState
}

interface IFullScreenInfoState {
  readonly renderInfo: boolean
  readonly renderTransitionGroup: boolean
  /**
   * The last seen window state which isn't 'hidden'. I.e. the
   * "real" window state regardless of whether the app is in
   * the background or not.
   */
  readonly windowState?: Exclude<WindowState, 'hidden'>
}

const toastTransitionTimeout = { appear: 100, exit: 250 }
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
  public static getDerivedStateFromProps(
    props: IFullScreenInfoProps,
    state: IFullScreenInfoState
  ): Partial<IFullScreenInfoState> | null {
    // We don't care about transitions to 'hidden', we only
    // care about when we transition from a 'real' window state
    // to 'full-screen'. See https://github.com/desktop/desktop/issues/7916
    if (props.windowState === 'hidden') {
      return null
    }

    if (state.windowState !== props.windowState) {
      const fullScreen = props.windowState === 'full-screen'

      return {
        windowState: props.windowState,
        renderInfo: fullScreen,
        renderTransitionGroup: fullScreen,
      }
    }

    return null
  }

  private infoDisappearTimeoutId: number | null = null
  private transitionGroupDisappearTimeoutId: number | null = null

  public constructor(props: IFullScreenInfoProps) {
    super(props)

    this.state = {
      renderInfo: false,
      renderTransitionGroup: false,
    }
  }

  public componentDidMount() {
    if (this.state.renderInfo) {
      this.scheduleInfoDisappear()
    }

    if (this.state.renderTransitionGroup) {
      this.scheduleTransitionGroupDisappear()
    }
  }

  public componentDidUpdate(
    prevProps: IFullScreenInfoProps,
    prevState: IFullScreenInfoState
  ) {
    if (prevState.renderInfo !== this.state.renderInfo) {
      if (this.state.renderInfo) {
        this.scheduleInfoDisappear()
      } else {
        this.clearInfoDisappearTimeout()
      }
    }

    if (prevState.renderTransitionGroup !== this.state.renderTransitionGroup) {
      if (this.state.renderTransitionGroup) {
        this.scheduleTransitionGroupDisappear()
      } else {
        this.clearTransitionGroupDisappearTimeout()
      }
    }
  }

  public componentWillUnmount() {
    this.clearInfoDisappearTimeout()
    this.clearTransitionGroupDisappearTimeout()
  }

  private scheduleInfoDisappear() {
    this.infoDisappearTimeoutId = window.setTimeout(
      this.onInfoDisappearTimeout,
      holdDuration
    )
  }

  private clearInfoDisappearTimeout() {
    if (this.infoDisappearTimeoutId !== null) {
      window.clearTimeout(this.infoDisappearTimeoutId)
      this.infoDisappearTimeoutId = null
    }
  }

  private scheduleTransitionGroupDisappear() {
    this.transitionGroupDisappearTimeoutId = window.setTimeout(
      this.onTransitionGroupDisappearTimeout,
      toastTransitionTimeout.appear + holdDuration + toastTransitionTimeout.exit
    )
  }

  private clearTransitionGroupDisappearTimeout() {
    if (this.transitionGroupDisappearTimeoutId !== null) {
      window.clearTimeout(this.transitionGroupDisappearTimeoutId)
      this.transitionGroupDisappearTimeoutId = null
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
      <CSSTransition
        classNames="toast-animation"
        appear={true}
        enter={false}
        exit={true}
        timeout={toastTransitionTimeout}
      >
        <div key="notification" className="toast-notification">
          Press <kbd>{kbdShortcut}</kbd> to exit fullscreen
        </div>
      </CSSTransition>
    )
  }

  public render() {
    if (!this.state.renderTransitionGroup) {
      return null
    }

    return (
      <TransitionGroup className="toast-notification-container">
        {this.renderFullScreenNotification()}
      </TransitionGroup>
    )
  }
}
