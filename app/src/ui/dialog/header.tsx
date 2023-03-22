import * as React from 'react'
import { Octicon, syncClockwise } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IDialogHeaderProps {
  /**
   * The dialog title text. Will be rendered top and center in a dialog.
   * You can also pass JSX for custom styling
   */
  readonly title: string | JSX.Element

  /**
   * An optional id for the h1 element that contains the title of this
   * dialog. Used to aid in accessibility by allowing the h1 to be referenced
   * in an aria-labeledby/aria-describedby attributed
   */
  readonly titleId?: string

  /**
   * Whether or not the implementing dialog is dismissable. This controls
   * whether or not the dialog header renders a close button or not.
   */
  readonly dismissable: boolean

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the dismissable prop.
   */
  readonly onDismissed?: () => void

  /**
   * Whether or not the dialog contents are currently involved in processing
   * data, executing an asynchronous operation or by other means working.
   * Setting this value will render a spinning progress icon in the header.
   * Note that the spinning icon will temporarily replace the dialog icon
   * (if present) for the duration of the loading operation.
   */
  readonly loading?: boolean
}

/**
 * A high-level component for Dialog headers.
 *
 * This component should typically not be used by consumers as the title prop
 * of the Dialog component should suffice. There are, however, cases where
 * custom content needs to be rendered in a dialog and in that scenario it
 * might be necessary to use this component directly.
 */
export class DialogHeader extends React.Component<IDialogHeaderProps, {}> {
  private onCloseButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    /** This prevent default is a preventative measure since the dialog is akin
     * to a big Form element. We wouldn't any surprise form handling. */
    e.preventDefault()
    if (this.props.onDismissed) {
      this.props.onDismissed()
    }
  }

  private renderCloseButton() {
    if (!this.props.dismissable) {
      return null
    }

    return (
      <button
        className="close"
        onClick={this.onCloseButtonClick}
        aria-label="close"
      >
        <Octicon symbol={OcticonSymbol.x} />
      </button>
    )
  }

  private renderTitle() {
    return <h1 id={this.props.titleId}>{this.props.title}</h1>
  }

  public render() {
    const spinner = this.props.loading ? (
      <Octicon className="icon spin" symbol={syncClockwise} />
    ) : null

    return (
      <header className="dialog-header">
        {this.renderTitle()}
        {spinner}
        {this.renderCloseButton()}
        {this.props.children}
      </header>
    )
  }
}
