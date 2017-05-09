import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import * as classNames from 'classnames'

interface IDialogErrorProps {
  readonly children?: ReadonlyArray<JSX.Element>

  /**
   * An optional type for the banner displayed.
   *
   * When passed 'warning', the error message will render with a yellow
   * background, black text, and an alert icon.
   *
   * Defaults to 'error'
   */
  readonly bannertype?: 'error' | 'warning'
}

/**
 * A component used for displaying short error messages inline
 * in a dialog. These error messages (there can be more than one)
 * should be rendered as the first child of the <Dialog> component
 * and support arbitrary content.
 *
 * The content (error message) is paired with a stop icon and receive
 * special styling.
 */
export class DialogError extends React.Component<IDialogErrorProps, void> {

  public render() {
    const classname = classNames('dialog-error', {
        'dialog-warning': this.props.bannertype === 'warning',
      })
    const octicon = this.props.bannertype === 'warning' ? OcticonSymbol.alert : OcticonSymbol.stop

    return (
      <div className={classname}>
        <Octicon symbol={octicon} />
        <div>
          {this.props.children}
        </div>
      </div>
    )
  }
}
