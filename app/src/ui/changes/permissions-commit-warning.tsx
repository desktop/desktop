import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

/** A warning displayed above the commit button
 */
export const PermissionsCommitWarning: React.FunctionComponent = props => {
  return (
    <div id="permissions-commit-warning" onContextMenu={ignoreContextMenu}>
      <div className="warning-icon-container">
        <Octicon className="warning-icon" symbol={OcticonSymbol.alert} />
      </div>
      <div className="warning-message">{props.children}</div>
    </div>
  )
}

const ignoreContextMenu = (event: React.MouseEvent<any>) => {
  // this prevents the context menu for the root element of CommitMessage from
  // firing - it shows 'Add Co-Authors' or 'Remove Co-Authors' based on the
  // form state, and for now I'm going to leave that behaviour as-is

  // feel free to remove this if that behaviour is revisited
  event.preventDefault()
}
