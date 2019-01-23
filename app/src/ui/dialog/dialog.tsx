import * as React from 'react'
import * as classNames from 'classnames'
import { DialogHeader } from './header'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'

/**
 * The time (in milliseconds) from when the dialog is mounted
 * until it can be dismissed. See the isAppearing property in
 * IDialogState for more information.
 */
const dismissGracePeriodMs = 250

/**
 * The time (in milliseconds) that we should wait after focusing before we
 * re-enable click dismissal. Note that this is only used on Windows.
 */
const DisableClickDismissalDelay = 500

/**
 * Title bar height in pixels. Values taken from 'app/styles/_variables.scss'.
 */
const titleBarHeight = __DARWIN__ ? 22 : 28

interface IDialogProps {
  /**
   * An optional dialog title. Most, if not all dialogs should have
   * this. When present the Dialog renders a DialogHeader element
   * containing an icon (if the type prop warrants it), the title itself
   * and a close button (if the dialog is dismissable).
   *
   * By omitting this consumers may use their own custom DialogHeader
   * for when the default component doesn't cut it.
   */
  readonly title?: string

  /**
   * Whether or not the dialog should be dismissable. A dismissable dialog
   * can be dismissed either by clicking on the backdrop or by clicking
   * the close button in the header (if a header was specified). Dismissal
   * will trigger the onDismissed event which callers must handle and pass
   * on to the dispatcher in order to close the dialog.
   *
   * A non-dismissable dialog can only be closed by means of the component
   * implementing a dialog. An example would be a critical error or warning
   * that requires explicit user action by for example clicking on a button.
   *
   * Defaults to true if omitted.
   */
  readonly dismissable?: boolean

  /**
   * Option to prevent dismissal by clicking outside of the dialog.
   * Requires `dismissal` to be true (or omitted) to have an effect.
   *
   * Defaults to false if omitted
   */
  readonly disableClickDismissalAlways?: boolean

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * An optional id for the rendered dialog element.
   */
  readonly id?: string

  /**
   * An optional dialog type. A warning or error dialog type triggers custom
   * styling of the dialog, see _dialog.scss for more detail.
   *
   * Defaults to 'normal' if omitted
   */
  readonly type?: 'normal' | 'warning' | 'error'

  /**
   * An event triggered when the dialog form is submitted. All dialogs contain
   * a top-level form element which can be triggered through a submit button.
   *
   * Consumers should handle this rather than subscribing to the onClick event
   * on the button itself since there may be other ways of submitting a specific
   * form (such as Ctrl+Enter).
   */
  readonly onSubmit?: () => void

  /**
   * An optional className to be applied to the rendered dialog element.
   */
  readonly className?: string

  /**
   * Whether or not the dialog should be disabled. All dialogs wrap their
   * content in a <fieldset> element which, when disabled, causes all descendant
   * form elements and buttons to also become disabled. This is useful for
   * consumers implementing a typical save dialog where the save action isn't
   * instantaneous (such as a sign in dialog) and they need to ensure that the
   * user doesn't continue mutating the form state or click buttons while the
   * save/submit action is in progress. Note that this does not prevent the
   * dialog from being dismissed.
   */
  readonly disabled?: boolean

  /**
   * Whether or not the dialog contents are currently involved in processing
   * data, executing an asynchronous operation or by other means working.
   * Setting this value will render a spinning progress icon in the dialog
   * header (if the dialog has a header). Note that the spinning icon
   * will temporarily replace the dialog icon (if present) for the duration
   * of the loading operation.
   */
  readonly loading?: boolean
}

interface IDialogState {
  /**
   * When a dialog is shown we wait for a few hundred milliseconds before
   * acknowledging a dismissal in order to avoid people accidentally dismissing
   * dialogs that appear as they're doing other things. Since the entire
   * backdrop of a dialog can be clicked to dismiss all it takes is one rogue
   * click and the dialog is gone. This is less than ideal if we're in the
   * middle of displaying an important error message.
   *
   * This state boolean is used to keep track of whether we're still in that
   * grace period or not.
   */
  readonly isAppearing: boolean

  /**
   * An optional id for the h1 element that contains the title of this
   * dialog. Used to aid in accessibility by allowing the h1 to be referenced
   * in an aria-labeledby/aria-describedby attributed. Undefined if the dialog
   * does not have a title or the component has not yet been mounted.
   */
  readonly titleId?: string
}

/**
 * A general purpose, versatile, dialog component which utilizes the new
 * <dialog> element. See https://demo.agektmr.com/dialog/
 *
 * A dialog is opened as a modal that prevents keyboard or pointer access to
 * underlying elements. It's not possible to use the tab key to move focus
 * out of the dialog without first dismissing it.
 */
export class Dialog extends React.Component<IDialogProps, IDialogState> {
  private dialogElement: HTMLElement | null = null
  private dismissGraceTimeoutId?: number

  private disableClickDismissalTimeoutId: number | null = null
  private disableClickDismissal = false

  public constructor(props: IDialogProps) {
    super(props)
    this.state = { isAppearing: true }
  }

  private clearDismissGraceTimeout() {
    if (this.dismissGraceTimeoutId !== undefined) {
      window.clearTimeout(this.dismissGraceTimeoutId)
      this.dismissGraceTimeoutId = undefined
    }
  }

  private scheduleDismissGraceTimeout() {
    this.clearDismissGraceTimeout()

    this.dismissGraceTimeoutId = window.setTimeout(
      this.onDismissGraceTimer,
      dismissGracePeriodMs
    )
  }

  private onDismissGraceTimer = () => {
    this.setState({ isAppearing: false })
  }

  private isDismissable() {
    return this.props.dismissable === undefined || this.props.dismissable
  }

  private updateTitleId() {
    if (this.state.titleId) {
      releaseUniqueId(this.state.titleId)
      this.setState({ titleId: undefined })
    }

    if (this.props.title) {
      this.setState((state, props) => ({
        titleId: createUniqueId(`Dialog_${props.id}_${props.title}`),
      }))
    }
  }

  public componentWillMount() {
    this.updateTitleId()
  }

  public componentDidMount() {
    // This cast to any is necessary since React doesn't know about the
    // dialog element yet.
    ;(this.dialogElement as any).showModal()

    this.setState({ isAppearing: true })
    this.scheduleDismissGraceTimeout()

    window.addEventListener('focus', this.onWindowFocus)
  }

  private onWindowFocus = () => {
    // On Windows and Linux, a click which focuses the window will also get
    // passed down into the DOM. But we don't want to dismiss the dialog based
    // on that click. See https://github.com/desktop/desktop/issues/2486.
    if (__WIN32__ || __LINUX__) {
      this.clearClickDismissalTimer()

      this.disableClickDismissal = true

      this.disableClickDismissalTimeoutId = window.setTimeout(() => {
        this.disableClickDismissal = false
        this.disableClickDismissalTimeoutId = null
      }, DisableClickDismissalDelay)
    }
  }

  private clearClickDismissalTimer() {
    if (this.disableClickDismissalTimeoutId) {
      window.clearTimeout(this.disableClickDismissalTimeoutId)
      this.disableClickDismissalTimeoutId = null
    }
  }

  public componentWillUnmount() {
    this.clearDismissGraceTimeout()

    if (this.state.titleId) {
      releaseUniqueId(this.state.titleId)
    }

    window.removeEventListener('focus', this.onWindowFocus)
  }

  public componentDidUpdate() {
    if (!this.props.title && this.state.titleId) {
      this.updateTitleId()
    }
  }

  private onDialogCancel = (e: Event) => {
    e.preventDefault()
    this.onDismiss()
  }

  private onDialogClick = (e: React.MouseEvent<HTMLElement>) => {
    if (this.isDismissable() === false) {
      return
    }

    // This event handler catches the onClick event of buttons in the
    // dialog. Ie, if someone hits enter inside the dialog form an onClick
    // event will be raised on the the submit button which isn't what we
    // want so we'll make sure that the original target for the event is
    // our own dialog element.
    if (e.target !== this.dialogElement) {
      return
    }

    const isInTitleBar = e.clientY <= titleBarHeight

    if (isInTitleBar) {
      return
    }

    // Ignore the first click right after the window's been focused. It could
    // be the click that focused the window, in which case we don't wanna
    // dismiss the dialog.
    if (this.disableClickDismissal) {
      this.disableClickDismissal = false
      this.clearClickDismissalTimer()
      return
    }

    // Figure out if the user clicked on the backdrop or in the dialog itself.
    const rect = e.currentTarget.getBoundingClientRect()

    // http://stackoverflow.com/a/26984690/2114
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width

    if (!this.props.disableClickDismissalAlways && !isInDialog) {
      e.preventDefault()
      this.onDismiss()
    }
  }

  private onDialogRef = (e: HTMLElement | null) => {
    // We need to explicitly subscribe to and unsubscribe from the dialog
    // element as react doesn't yet understand the element and which events
    // it has.
    if (!e) {
      if (this.dialogElement) {
        this.dialogElement.removeEventListener('cancel', this.onDialogCancel)
        this.dialogElement.removeEventListener('keydown', this.onKeyDown)
      }
    } else {
      e.addEventListener('cancel', this.onDialogCancel)
      e.addEventListener('keydown', this.onKeyDown)
    }

    this.dialogElement = e
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const shortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if ((shortcutKey && event.key === 'w') || event.key === 'Escape') {
      this.onDialogCancel(event)
    }
  }

  private onDismiss = () => {
    if (this.isDismissable() && !this.state.isAppearing) {
      if (this.props.onDismissed) {
        this.props.onDismissed()
      }
    }
  }

  private onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (this.props.onSubmit) {
      this.props.onSubmit()
    } else {
      this.onDismiss()
    }
  }

  private renderHeader() {
    if (!this.props.title) {
      return null
    }

    return (
      <DialogHeader
        title={this.props.title}
        titleId={this.state.titleId}
        dismissable={this.isDismissable()}
        onDismissed={this.onDismiss}
        loading={this.props.loading}
      />
    )
  }

  public render() {
    const className = classNames(
      {
        error: this.props.type === 'error',
        warning: this.props.type === 'warning',
      },
      this.props.className
    )

    return (
      <dialog
        ref={this.onDialogRef}
        id={this.props.id}
        onClick={this.onDialogClick}
        className={className}
        aria-labelledby={this.state.titleId}
      >
        {this.renderHeader()}

        <form onSubmit={this.onSubmit}>
          <fieldset disabled={this.props.disabled}>
            {this.props.children}
          </fieldset>
        </form>
      </dialog>
    )
  }
}
