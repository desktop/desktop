import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

/**
 * A component used for displaying short warning/error messages inline
 * in a dialog. These error messages (there can be more than one)
 * should be rendered as the first child of the <Dialog> component
 * and support arbitrary content.
 *
 * The content (warning/error message) is paired with an appropriate icon and receives
 * special styling.
 *
 * Provide `children` to display content inside the error dialog.
 */
export class DialogError extends React.Component<{ type?: 'error' | 'warning' }> {
  public render() {
    const type = this.props.type ?? 'error'
    const className = `dialog-banner ${type}`
    const symbol = type === 'warning' ? OcticonSymbol.alert : OcticonSymbol.stop

    return (
      <div className={className} role="alert">
        <Octicon symbol={symbol} />
        <div>{this.props.children}</div>
      </div>
    )
  }
}
