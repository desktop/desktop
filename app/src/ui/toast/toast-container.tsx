import * as React from 'react'
import { TransitionGroup, CSSTransition } from 'react-transition-group'

interface IToastContainerProps {
  /**
   * The toast content to display. When null/undefined, the container
   * is hidden but remains in the DOM for animations.
   */
  readonly children: React.ReactNode

  /**
   * A unique key for the current toast content, used to properly
   * animate transitions when switching between different toasts.
   */
  readonly toastKey?: string

  /**
   * Auto-dismiss timeout in milliseconds. If provided, the toast will
   * automatically dismiss after this duration (pausing while hovered).
   */
  readonly timeout?: number

  /**
   * Callback when the toast should be dismissed (either by timeout or user action).
   */
  readonly onDismissed?: () => void
}

interface IToastContainerState {
  readonly isHovered: boolean
}

const toastTransitionTimeout = {
  enter: 300,
  exit: 250,
}

/**
 * A container for toast notifications positioned in the bottom-right
 * corner of the window. Unlike banners, toasts overlay content rather
 * than pushing it down, avoiding layout shifts.
 */
export class ToastContainer extends React.Component<
  IToastContainerProps,
  IToastContainerState
> {
  private dismissalTimeoutId: number | null = null
  private remainingTime: number = 0
  private timeoutStartedAt: number = 0

  public constructor(props: IToastContainerProps) {
    super(props)
    this.state = { isHovered: false }
  }

  public componentDidMount() {
    this.startDismissalTimer()
  }

  public componentDidUpdate(prevProps: IToastContainerProps) {
    // Reset timer and hover state when toast content changes
    if (prevProps.toastKey !== this.props.toastKey) {
      this.clearDismissalTimer()
      // Reset hover state - even if mouse is still in the area,
      // we want the new toast's timer to start fresh
      this.setState({ isHovered: false }, () => {
        this.startDismissalTimer()
      })
    }
  }

  public componentWillUnmount() {
    this.clearDismissalTimer()
  }

  private startDismissalTimer() {
    const { timeout, children } = this.props
    if (timeout === undefined || !children) {
      return
    }

    this.remainingTime = timeout
    this.resumeDismissalTimer()
  }

  private resumeDismissalTimer() {
    if (this.remainingTime <= 0 || this.state.isHovered) {
      return
    }

    this.timeoutStartedAt = Date.now()
    this.dismissalTimeoutId = window.setTimeout(() => {
      this.props.onDismissed?.()
    }, this.remainingTime)
  }

  private pauseDismissalTimer() {
    if (this.dismissalTimeoutId !== null) {
      window.clearTimeout(this.dismissalTimeoutId)
      this.dismissalTimeoutId = null

      // Calculate remaining time
      const elapsed = Date.now() - this.timeoutStartedAt
      this.remainingTime = Math.max(0, this.remainingTime - elapsed)
    }
  }

  private clearDismissalTimer() {
    if (this.dismissalTimeoutId !== null) {
      window.clearTimeout(this.dismissalTimeoutId)
      this.dismissalTimeoutId = null
    }
    this.remainingTime = 0
  }

  private onMouseEnter = () => {
    this.pauseDismissalTimer()
    this.setState({ isHovered: true })
  }

  private onMouseLeave = () => {
    this.setState({ isHovered: false }, () => {
      this.resumeDismissalTimer()
    })
  }

  public render() {
    return (
      <div className="toast-container">
        <TransitionGroup component={null}>
          {this.props.children && (
            <CSSTransition
              key={this.props.toastKey ?? 'toast'}
              classNames="toast"
              timeout={toastTransitionTimeout}
            >
              <div
                className="toast-content"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}
              >
                {this.props.children}
              </div>
            </CSSTransition>
          )}
        </TransitionGroup>
      </div>
    )
  }
}
