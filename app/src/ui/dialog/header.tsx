import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'

interface IDialogHeaderProps {
  /**
   * The dialog title text. Will be rendered top and center in a dialog.
   */
  readonly title: string

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
   * An optional type of dialog header. If the type is error or warning
   * an applicable icon will be rendered top left in the dialog.
   * 
   * Defaults to 'normal' if omitted.
   */
  readonly type?: 'normal' | 'warning' | 'error'
}

/**
 * A high-level component for Dialog headers.
 * 
 * This component should typically not be used by consumers as the title prop
 * of the Dialog component should suffice. There are, however, cases where
 * custom content needs to be rendered in a dialog and in that scenario it
 * might be necessary to use this component directly.
 */
export class DialogHeader extends React.Component<IDialogHeaderProps, void> {

  private onCloseButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onDismissed) {
      this.props.onDismissed()
    }
  }

  // When the dialog is shown as a modal it insists on giving the first input
  // element focus and that happens to be the close button that we've explicitly
  // specified to not be keyboard reachable. Closing the dialog should be done
  // by hitting escape or clicking on the button. Only the elements within the
  // dialog contents and footer should be keyboard reachable. So we employ this
  // hack to blur the close button if it receives focus. If we don't do this then
  // hitting enter inside a dialog won't submit the form at all but rather close
  // the dialog.
  private onCloseButtonFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    //e.currentTarget.blur()
  }

  private renderCloseButton() {
    if (!this.props.dismissable) {
      return null
    }

    return (
      <button className='close' tabIndex={-1} onClick={this.onCloseButtonClick} onFocus={this.onCloseButtonFocus}>
        <Octicon symbol={OcticonSymbol.x} />
      </button>
    )
  }

  private renderIcon() {
    if (this.props.type === undefined || this.props.type === 'normal') {
      return null
    } else if (this.props.type === 'error') {
      return <Octicon className='icon' symbol={OcticonSymbol.stop} />
    } else if (this.props.type === 'warning') {
      return <Octicon className='icon' symbol={OcticonSymbol.alert} />
    }

    return assertNever(this.props.type, `Unknown dialog header type ${this.props.type}`)
  }

  public render() {
    return (
      <header className='dialog-header'>
        {this.renderIcon()}
        <h1>{this.props.title}</h1>
        {this.renderCloseButton()}
      </header>
    )
  }
}
