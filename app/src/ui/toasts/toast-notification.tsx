import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'

interface IToastNotificationProps {
  readonly id?: string
  readonly timeout?: number
  readonly dismissable?: boolean
  readonly className?: string
  readonly onDismissed: () => void
}

export class ToastNotification extends React.Component<
  IToastNotificationProps,
  {}
> {
  private toastRef = React.createRef<HTMLDivElement>()

  // Timeout ID for manual focus placement after mounting
  private focusTimeoutId: number | null = null

  // Timeout ID for auto-dismissal of the toast after focus is lost
  private dismissalTimeoutId: number | null = null

  public render() {
    const cn = classNames('toast-notification', this.props.className)
    return (
      <div id={this.props.id} className={cn} ref={this.toastRef}>
        <div className="contents">{this.props.children}</div>
        {this.renderCloseButton()}
      </div>
    )
  }

  private renderCloseButton() {
    const { dismissable, onDismissed } = this.props

    if (dismissable === false) {
      return null
    }

    return (
      <div className="close">
        <button onClick={onDismissed} aria-label="Dismiss this message">
          <Octicon symbol={octicons.x} />
        </button>
      </div>
    )
  }

  public componentDidMount() {
    this.focusTimeoutId = window.setTimeout(() => {
      this.focusOnFirstSuitableElement()
    }, 200)
    this.addDismissalFocusListeners()
  }

  public componentWillUnmount() {
    if (this.focusTimeoutId !== null) {
      window.clearTimeout(this.focusTimeoutId)
      this.focusTimeoutId = null
    }

    this.removeDismissalFocusListeners()
  }

  private focusOnFirstSuitableElement = () => {
    const target =
      this.toastRef.current?.querySelector('a') ||
      this.toastRef.current?.querySelector('button')
    target?.focus()
  }

  private addDismissalFocusListeners() {
    this.toastRef.current?.addEventListener('focusin', this.onFocusIn)
    this.toastRef.current?.addEventListener('focusout', this.onFocusOut)
  }

  private removeDismissalFocusListeners() {
    this.toastRef.current?.removeEventListener('focusout', this.onFocusOut)
    this.toastRef.current?.removeEventListener('focusin', this.onFocusIn)
  }

  private onFocusIn = () => {
    if (this.dismissalTimeoutId !== null) {
      window.clearTimeout(this.dismissalTimeoutId)
      this.dismissalTimeoutId = null
    }
  }

  private onFocusOut = async (event: FocusEvent) => {
    const { dismissable, onDismissed, timeout } = this.props

    if (
      event.relatedTarget &&
      this.toastRef.current?.contains(event.relatedTarget as Node)
    ) {
      return
    }

    if (dismissable !== false && timeout !== undefined) {
      this.dismissalTimeoutId = window.setTimeout(() => {
        onDismissed()
      }, timeout)
    }
  }
}
