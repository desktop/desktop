import * as React from 'react'
import * as classNames from 'classnames'
import { Octicon, OcticonSymbol } from '../octicons'

interface IDialogErrorProps {
  readonly className?: string
}

/**
 * A component used for displaying short error messages inline
 * in a dialog. These error messages (there can be more than one)
 * should be rendered as the first child of the <Dialog> component
 * and support arbitrary content.
 *
 * The content (error message) is paired with a stop icon and receive
 * special styling.
 *
 * Provide `children` to display content inside the error dialog.
 */
export class DialogError extends React.Component<IDialogErrorProps, {}> {
  public render() {
    const cn = classNames('dialog-error', this.props.className)
    return (
      <div className={cn}>
        <Octicon symbol={OcticonSymbol.stop} />
        <div>{this.props.children}</div>
      </div>
    )
  }
}
