/** This is helper interface used when we have a message displayed that is a
 * JSX.Element for visual styling and that message also needs to be given to
 * screen reader users as well. Screen reader only messages should only be
 * strings to prevent tab focusable element from being rendered but not visible
 * as screen reader only messages are visually hidden */
export interface IAccessibleMessage {
  /** A message presented to screen reader users via an aria-live component. */
  screenReaderMessage: string

  /** A message visually displayed to the user. */
  displayedMessage: string | JSX.Element
}
