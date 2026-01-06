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
}

const toastTransitionTimeout = {
  enter: 250,
  exit: 200,
}

/**
 * A container for toast notifications positioned in the bottom-right
 * corner of the window. Unlike banners, toasts overlay content rather
 * than pushing it down, avoiding layout shifts.
 */
export class ToastContainer extends React.Component<IToastContainerProps> {
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
