import * as React from 'react'
import classNames from 'classnames'
import { DialogHeader } from './header'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { getTitleBarHeight } from '../window/title-bar'
import { isTopMostDialog } from './is-top-most'
import { isMacOSSonoma, isMacOSVentura } from '../../lib/get-os'
import { sendDialogDidOpen } from '../main-process-proxy'

/**
 * Class name used for elements that should be focused initially when a dialog
 * is shown.
 */
export const DialogPreferredFocusClassName = 'dialog-preferred-focus'

export interface IDialogStackContext {
  /** Whether or not this dialog is the top most one in the stack to be
   * interacted with by the user. This will also determine if event listeners
   * will be active or not. */
  isTopMost: boolean
}

/**
 * The DialogStackContext is used to communicate between the `Dialog` and the
 * `App` information that is mostly unique to the `Dialog` component such as
 * whether it is at the top of the popup stack. Some, but not the vast majority,
 * custom popup components in between may also utilize this to enable and
 * disable event listeners in response to changes in whether it is the top most
 * popup.
 *
 * NB *** React.Context is not the preferred method of passing data to child
 * components for this code base. We are choosing to use it here as implementing
 * prop drilling would be extremely tedious and would lead to adding  `Dialog`
 * props on 60+ components that would not otherwise use them. ***
 *
 */
export const DialogStackContext = React.createContext<IDialogStackContext>({
  isTopMost: false,
})

/**
 * The time (in milliseconds) from when the dialog is mounted
 * until it can be dismissed. See the isAppearing property in
 * IDialogState for more information.
 */
const dismissGracePeriodMs = 250

/**
 * The time (in milliseconds) that we should wait after focusing before we
 * re-enable click dismissal.
 */
const DisableClickDismissalDelay = 500

/**
 * Title bar height in pixels
 */
const titleBarHeight = getTitleBarHeight()

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
  readonly title?: string | JSX.Element

  /**
   * Typically, a titleId is automatically generated based on the title
   * attribute if it is a string. If it is not provided, we must assume the
   * responsibility of providing a titleID that is used as the id of the h1 in
   * the custom header and used in the aria attributes in this dialog component.
   * By providing this titleID, the state.titleID will be set to this value and
   * used in the aria attributes.
   * */
  readonly titleId?: string

  /**
   * An optional element to render to the right of the dialog title.
   * This can be used to render additional controls that don't belong to the
   * heading element itself, but are still part of the header (visually).
   */
  readonly renderHeaderAccessory?: () => JSX.Element

  /**
   * Whether or not the dialog should be dismissable by clicking on the
   * backdrop. Dismissal will trigger the onDismissed event which callers
   * must handle and pass on to the dispatcher in order to close the dialog.
   *
   * Defaults to true if omitted.
   */
  readonly backdropDismissable?: boolean

  /**
   * Whether or not the dialog should be dismissable by any built-in means
   * (like pressing Escape, clicking on the close button, or clicking on the
   * backdrop -if enabled-).
   *
   * Defaults to false if omitted.
   */
  readonly dismissDisabled?: boolean

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the dismissable prop.
   */
  readonly onDismissed?: () => void

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

  /** Whether or not to override focus of first element with close button */
  readonly focusCloseButtonOnOpen?: boolean

  readonly onDialogRef?: (ref: HTMLDialogElement | null) => void
}

/**
 * If role is alertdialog, ariaDescribedBy is required.
 */
interface IAlertDialogProps extends IDialogProps {
  /** This is used to point to an element containing content pertinent to the
   * users workflow. This should be provided for dialogs that are alerts or
   * confirmations so that that the information that is interrupting the user's
   * workflow is screen reader announced and acquire a response */
  readonly ariaDescribedBy: string

  /** By default, a dialog has role of "dialog" and requires the use of an
   * "aria-label" or "aria-labelledby" to accessibily announce the title or
   * purpose of the header. This is typically accomplished by providing the
   * `title` prop and the dialog component will take care of adding the
   * `aria-labelledby` attribute.
   *
   * However, if the dialog is an alert or confirmation dialog we should use the
   * role of `alertdialog` AND the `ariaDescribedBy` prop should be provided
   * containing the id of the element with the information required by the user
   * to proceed or be made aware of to ensure it is also read by screen readers.
   *
   *
   * https://www.w3.org/TR/wai-aria-1.1/#alertdialog
   * "An alert dialog is a modal dialog that interrupts the user's workflow to
   * communicate an important message and acquire a response. Examples include
   * action confirmation prompts and error message confirmations. The
   * alertdialog role enables assistive technologies and browsers to distinguish
   * alert dialogs from other dialogs so they have the option of giving alert
   * dialogs special treatment, such as playing a system alert sound."
   * */
  readonly role: 'alertdialog'
}

/**
 * If role is undefined or dialog, ariaDescribedBy is optional.
 */
interface IDescribedByDialogProps extends IDialogProps {
  /** This is used to point to an element containing content pertinent to the
   * users workflow. This should be provided for dialogs that are alerts or
   * confirmations so that that the information that is interrupting the user's
   * workflow is screen reader announced and acquire a response */
  readonly ariaDescribedBy?: string

  /** By default, a dialog has role of "dialog". This is only required for a
   * role of 'alertdialog' in which case  `ariaDescribedBy` must also be
   * provided */
  readonly role?: 'dialog'
}

/** Interface union to force usage of `ariaDescribedBy` if role of `alertdialog`
 * is used */
type DialogProps = IAlertDialogProps | IDescribedByDialogProps

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
export class Dialog extends React.Component<DialogProps, IDialogState> {
  public static contextType = DialogStackContext
  public declare context: React.ContextType<typeof DialogStackContext>

  private checkIsTopMostDialog = isTopMostDialog(
    () => {
      this.onDialogIsTopMost()
    },
    () => {
      this.onDialogIsNotTopMost()
    }
  )

  private dialogElement: HTMLDialogElement | null = null
  private dismissGraceTimeoutId?: number

  private disableClickDismissalTimeoutId: number | null = null
  private disableClickDismissal = false

  /**
   * Resize observer used for tracking width changes and
   * refreshing the internal codemirror instance when
   * they occur
   */
  private readonly resizeObserver: ResizeObserver
  private resizeDebounceId: number | null = null

  public constructor(props: DialogProps) {
    super(props)
    this.state = { isAppearing: true, titleId: this.props.titleId }

    // Observe size changes and let codemirror know
    // when it needs to refresh.
    this.resizeObserver = new ResizeObserver(this.scheduleResizeEvent)
  }

  private scheduleResizeEvent = () => {
    if (this.resizeDebounceId !== null) {
      cancelAnimationFrame(this.resizeDebounceId)
      this.resizeDebounceId = null
    }
    this.resizeDebounceId = requestAnimationFrame(this.onResized)
  }

  /**
   * Attempt to ensure that the entire dialog is always visible. Chromium
   * takes care of positioning the dialog when we initially show it but
   * subsequent resizes of either the dialog (such as when switching tabs
   * in the preferences dialog) or the Window doesn't affect positioning.
   */
  private onResized = () => {
    if (!this.dialogElement) {
      return
    }

    const { offsetTop, offsetHeight } = this.dialogElement

    // Not much we can do if the dialog is bigger than the window
    if (offsetHeight > window.innerHeight - titleBarHeight) {
      return
    }

    const padding = 10
    const overflow = offsetTop + offsetHeight + padding - window.innerHeight

    if (overflow > 0) {
      const top = Math.max(titleBarHeight, offsetTop - overflow)
      this.dialogElement.style.top = `${top}px`
    }
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

    this.dialogElement?.dispatchEvent(
      new CustomEvent('dialog-appeared', {
        bubbles: true,
        cancelable: false,
      })
    )
  }

  private isBackdropDismissable() {
    return this.props.backdropDismissable !== false
  }

  private isDismissable() {
    return this.props.dismissDisabled !== true
  }

  private updateTitleId() {
    if (this.props.titleId) {
      // Using the one provided that is used in a custom header
      return
    }

    if (this.state.titleId) {
      releaseUniqueId(this.state.titleId)
      this.setState({ titleId: undefined })
    }

    if (this.props.title) {
      // createUniqueId handles static strings fine, so in the case of receiving
      // a JSX element for the title we can just pass in a fixed value rather
      // than trying to generate a string from an arbitrary element
      const id = typeof this.props.title === 'string' ? this.props.title : '???'
      this.setState({
        titleId: createUniqueId(`Dialog_${this.props.id}_${id}`),
      })
    }
  }

  public componentWillMount() {
    this.updateTitleId()
  }

  public componentDidMount() {
    sendDialogDidOpen()
    this.checkIsTopMostDialog(this.context.isTopMost)
  }

  protected onDialogIsTopMost() {
    if (this.dialogElement == null) {
      return
    }

    if (!this.dialogElement.open) {
      this.dialogElement.showModal()
    }

    // Provide an event that components can subscribe to in order to perform
    // tasks such as re-layout after the dialog is visible
    this.dialogElement.dispatchEvent(
      new CustomEvent('dialog-show', {
        bubbles: true,
        cancelable: false,
      })
    )

    this.setState({ isAppearing: true })
    this.scheduleDismissGraceTimeout()

    this.focusFirstSuitableChild()

    window.addEventListener('focus', this.onWindowFocus)

    this.resizeObserver.observe(this.dialogElement)
    window.addEventListener('resize', this.scheduleResizeEvent)
  }

  protected onDialogIsNotTopMost() {
    if (this.dialogElement !== null && this.dialogElement.open) {
      this.dialogElement?.close()
    }

    this.clearDismissGraceTimeout()

    window.removeEventListener('focus', this.onWindowFocus)
    document.removeEventListener('mouseup', this.onDocumentMouseUp)

    this.resizeObserver.disconnect()
    window.removeEventListener('resize', this.scheduleResizeEvent)
  }

  /**
   * Attempts to move keyboard focus to the first _suitable_ child of the
   * dialog.
   *
   * The original motivation for this function is that while the order of the
   * Ok, and Cancel buttons differ between platforms (see OkCancelButtonGroup)
   * we don't want to accidentally put keyboard focus on the destructive
   * button (like the Ok button in the discard changes dialog) but rather
   * on the non-destructive action. This logic originates from the macOS
   * human interface guidelines
   *
   * From https://developer.apple.com/design/human-interface-guidelines/macos/windows-and-views/dialogs/:
   *
   *   "Users sometimes press Return merely to dismiss a dialog, without
   *   reading its content, so it’s crucial that a default button initiate
   *   a harmless action. [...] when a dialog may result in a destructive
   *   action, Cancel can be set as the default button."
   *
   * The same guidelines also has this to say about focus:
   *
   *   "Set the initial focus to the first location that accepts user input.
   *    Doing so lets the user begin entering data immediately, without needing
   *    to click a specific item like a text field or list."
   *
   * In attempting to follow the guidelines outlined above we follow a priority
   * order in determining the first suitable child.
   *
   *  1. An element marked with the `DialogPreferredFocusClassName` class.
   *     Sometimes we just need a specific element to get focus first, and it's
   *     hard to fit it into the rest of these generic focus rules.
   *
   *  2. The element with the lowest positive tabIndex
   *     This might sound counterintuitive but imagine the following pseudo
   *     dialog this would be button D as button D would be the first button
   *     to get focused when hitting Tab.
   *
   *     <dialog>
   *      <button>A</button>
   *      <button tabIndex=3>B</button>
   *      <button tabIndex=2>C</button>
   *      <button tabIndex=1>D</button>
   *     </dialog>
   *
   *  3. The first element which is either implicitly keyboard focusable (like a
   *     text input field) or explicitly focusable through tabIndex=0 (like a TabBar
   *     tab)
   *
   *  4. The first submit button. We use this as a proxy for what macOS HIG calls
   *     "default button". It's not the same thing but for our purposes it's close
   *     enough.
   *
   *  5. Any remaining button
   *
   *  6. The dialog close button
   *
   */
  public focusFirstSuitableChild() {
    const dialog = this.dialogElement

    if (dialog === null) {
      return
    }

    const selector = [
      'input:not([type=hidden]):not(:disabled):not([tabindex="-1"])',
      'textarea:not(:disabled):not([tabindex="-1"])',
      'button:not(:disabled):not([tabindex="-1"])',
      '[tabindex]:not(:disabled):not([tabindex="-1"])',
    ].join(', ')

    // Element marked as "preferred" to have the focus when dialog is shown
    let firstPreferred: HTMLElement | null = null

    // The element which has the lowest explicit tab index (i.e. greater than 0)
    let firstExplicit: { 0: number; 1: HTMLElement | null } = [Infinity, null]

    // First submit button
    let firstSubmitButton: HTMLElement | null = null

    // The first button-like element (input, submit, reset etc)
    let firstButton: HTMLElement | null = null

    // The first element which is either implicitly keyboard focusable (like a
    // text input field) or explicitly focusable through tabIndex=0 (like an
    // anchor tag masquerading as a button)
    let firstTabbable: HTMLElement | null = null

    const closeButton = dialog.querySelector(
      ':scope > div.dialog-header button.close'
    )

    if (
      closeButton instanceof HTMLElement &&
      this.props.focusCloseButtonOnOpen
    ) {
      closeButton.focus()
      return
    }

    const excludedInputTypes = [
      ':not([type=button])',
      ':not([type=submit])',
      ':not([type=reset])',
      ':not([type=hidden])',
      ':not([type=radio])',
    ]

    const preferredFirstSelector = `.${DialogPreferredFocusClassName}`
    const inputSelector = `input${excludedInputTypes.join('')}, textarea`
    const buttonSelector =
      'input[type=button], input[type=submit] input[type=reset], button'

    const submitSelector = 'input[type=submit], button[type=submit]'

    for (const candidate of dialog.querySelectorAll(selector)) {
      if (!(candidate instanceof HTMLElement)) {
        continue
      }

      const tabIndex = parseInt(candidate.getAttribute('tabindex') || '', 10)

      if (
        firstPreferred === null &&
        candidate.matches(preferredFirstSelector)
      ) {
        firstPreferred = candidate
      } else if (tabIndex > 0 && tabIndex < firstExplicit[0]) {
        firstExplicit = [tabIndex, candidate]
      } else if (
        firstTabbable === null &&
        (tabIndex === 0 || candidate.matches(inputSelector))
      ) {
        firstTabbable = candidate
      } else if (
        firstSubmitButton === null &&
        candidate.matches(submitSelector)
      ) {
        firstSubmitButton = candidate
      } else if (
        firstButton === null &&
        candidate.matches(buttonSelector) &&
        candidate !== closeButton
      ) {
        firstButton = candidate
      }
    }

    const focusCandidates = [
      firstPreferred,
      firstExplicit[1],
      firstTabbable,
      firstSubmitButton,
      firstButton,
      closeButton,
    ]

    for (const focusCandidate of focusCandidates) {
      if (focusCandidate instanceof HTMLElement) {
        focusCandidate.focus()
        break
      }
    }
  }

  private onWindowFocus = () => {
    // On Windows and Linux, a click which focuses the window will also get
    // passed down into the DOM. But we don't want to dismiss the dialog based
    // on that click. See https://github.com/desktop/desktop/issues/2486.
    // macOS normally automatically disables "click-through" behavior but
    // we've intentionally turned that off so we need to apply the same
    // behavior regardless of platform.
    // See https://github.com/desktop/desktop/pull/3843.
    this.clearClickDismissalTimer()

    this.disableClickDismissal = true

    this.disableClickDismissalTimeoutId = window.setTimeout(() => {
      this.disableClickDismissal = false
      this.disableClickDismissalTimeoutId = null
    }, DisableClickDismissalDelay)
  }

  private clearClickDismissalTimer() {
    if (this.disableClickDismissalTimeoutId) {
      window.clearTimeout(this.disableClickDismissalTimeoutId)
      this.disableClickDismissalTimeoutId = null
    }
  }

  public componentWillUnmount() {
    if (this.state.titleId) {
      releaseUniqueId(this.state.titleId)
    }

    this.checkIsTopMostDialog(false)
  }

  public componentDidUpdate(prevProps: DialogProps) {
    if (!this.props.title && this.state.titleId) {
      this.updateTitleId()
    }

    this.checkIsTopMostDialog(this.context.isTopMost)
  }

  private onDialogCancel = (e: Event | React.SyntheticEvent) => {
    e.preventDefault()
    this.onDismiss()
  }

  private onDialogMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented) {
      return
    }

    if (!this.isDismissable() || !this.isBackdropDismissable()) {
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

    // Ignore the first click right after the window's been focused. It could
    // be the click that focused the window, in which case we don't wanna
    // dismiss the dialog.
    if (this.disableClickDismissal) {
      this.disableClickDismissal = false
      this.clearClickDismissalTimer()
      return
    }

    if (!this.mouseEventIsInsideDialog(e)) {
      // The user has pressed down on their pointer device outside of the
      // dialog (i.e. on the backdrop). Now we subscribe to the global
      // mouse up event where we can make sure that they release the pointer
      // device on the backdrop as well.
      document.addEventListener('mouseup', this.onDocumentMouseUp, {
        once: true,
      })
    }
  }

  private mouseEventIsInsideDialog(
    e: React.MouseEvent<HTMLElement> | MouseEvent
  ) {
    // it's possible that we've been unmounted
    if (this.dialogElement === null) {
      return false
    }

    const isInTitleBar = e.clientY <= titleBarHeight

    if (isInTitleBar) {
      return false
    }

    // Figure out if the user clicked on the backdrop or in the dialog itself.
    const rect = this.dialogElement.getBoundingClientRect()

    // http://stackoverflow.com/a/26984690/2114
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width

    return isInDialog
  }

  /**
   * Subscribed to from the onDialogMouseDown when the user
   * presses down on the backdrop, ensures that we only dismiss
   * the dialog if they release their pointer device over the
   * backdrop as well (as opposed to over the dialog itself).
   */
  private onDocumentMouseUp = (e: MouseEvent) => {
    if (!e.defaultPrevented && !this.mouseEventIsInsideDialog(e)) {
      e.preventDefault()
      this.onDismiss()
    }
  }

  private onDialogRef = (e: HTMLDialogElement | null) => {
    // We need to explicitly subscribe to and unsubscribe from the dialog
    // element as react doesn't yet understand the element and which events
    // it has.
    if (!e) {
      if (this.dialogElement) {
        this.dialogElement.removeEventListener('cancel', this.onDialogCancel)
      }
    } else {
      e.addEventListener('cancel', this.onDialogCancel)
    }

    this.dialogElement = e
    this.props.onDialogRef?.(e)
  }

  private onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

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
        showCloseButton={this.isDismissable()}
        onCloseButtonClick={this.onDismiss}
        renderAccessory={this.props.renderHeaderAccessory}
        loading={this.props.loading}
      />
    )
  }

  /**
   * Gets the aria-labelledby and aria-describedby attributes for the dialog
   * element.
   *
   * The correct semantics are that the dialog element should have the
   * aria-labelledby and the aria-describedby is optional unless the dialog has
   * a role of alertdialog, in which case both are required.
   *
   * However, macOS VoiceOver is not consistent. We have different implementations for it.
   */
  private getAriaAttributes() {
    if (isMacOSVentura()) {
      /*
       * macOs Ventura introduced a regression in that:
       *
       * For role of 'dialog' (default),  the aria-labelledby is not announced and
       *    if provided prevents the aria-describedby from being announced. Thus,
       *    this method will add the aria-labelledby to the aria-describedby in this
       *    case.
       *
       * For role of 'alertdialog', the aria-labelledby is announced but not the
       *    aria-describedby. Thus, this method will add both to the
       *    aria-labelledby.
       *
       * Neither of the above is semantically correct tho, hopefully, macOs will be
       * fixed in a future release. The issue is known for macOS versions 13.0 to
       * the current version of 13.5 as of 2023-07-31.
       *
       * A known macOS behavior is that if two ids are provided to the
       * aria-describedby only the first one is announced with a note about the
       * second one existing. This currently does not impact us as we only provide
       * one id for non-alert dialogs and the alert dialogs are handled with the
       * `aria-labelledby` where both ids are announced
       */
      if (this.props.role === 'alertdialog') {
        return {
          'aria-labelledby': `${this.state.titleId} ${this.props.ariaDescribedBy}`,
        }
      }

      return {
        'aria-describedby': `${this.state.titleId} ${
          this.props.ariaDescribedBy ?? ''
        }`,
      }
    }

    if (isMacOSSonoma() && this.props.role !== 'alertdialog') {
      // macOS Sonoma introduced a regression in that: For role of 'dialog', the
      // aria-labelledby is not announced. However, if the dialog has a child
      // with a role of header (aka h* elemeent) it will be announced as long as
      // the aria-labelledby is NOT provided.
      return {
        'aria-describedby': this.props.ariaDescribedBy,
      }
    }

    // correct semantics
    return {
      'aria-labelledby': this.state.titleId,
      'aria-describedby': this.props.ariaDescribedBy,
    }
  }

  public render() {
    const className = classNames(
      {
        error: this.props.type === 'error',
        warning: this.props.type === 'warning',
      },
      this.props.className,
      'tooltip-host'
    )

    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
      <dialog
        ref={this.onDialogRef}
        id={this.props.id}
        role={this.props.role}
        onMouseDown={this.onDialogMouseDown}
        onKeyDown={this.onKeyDown}
        className={className}
        {...this.getAriaAttributes()}
        tabIndex={-1}
      >
        {this.renderHeader()}

        <form onSubmit={this.onSubmit} onReset={this.onDismiss}>
          <fieldset disabled={this.props.disabled}>
            {this.props.children}
          </fieldset>
        </form>
      </dialog>
    )
  }
}
