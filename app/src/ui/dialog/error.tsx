import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

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
export class DialogError extends React.Component {
  public render() {
    return (
      <div className="dialog-banner dialog-error" role="alert">
        <Octicon symbol={octicons.stop} />
        <div>{this.props.children}</div>
      </div>
    )
  }
}
