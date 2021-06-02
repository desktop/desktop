import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { Octicon, OcticonSymbol } from '../octicons'

export enum PermissionsCommitWarningIcon {
  Warning,
  Information,
}

const renderIcon = (icon: PermissionsCommitWarningIcon) => {
  let className = ''
  let symbol = OcticonSymbol.alert

  switch (icon) {
    case PermissionsCommitWarningIcon.Warning:
      className = 'warning-icon'
      symbol = OcticonSymbol.alert
      break
    case PermissionsCommitWarningIcon.Information:
      className = 'information-icon'
      symbol = OcticonSymbol.info
      break
    default:
      assertNever(icon, `Unexpected icon value ${icon}`)
  }

  return <Octicon className={className} symbol={symbol} />
}

/** A warning displayed above the commit button
 */
export const PermissionsCommitWarning: React.FunctionComponent<{
  readonly icon: PermissionsCommitWarningIcon
}> = props => {
  return (
    <div id="permissions-commit-warning" onContextMenu={ignoreContextMenu}>
      <div className="warning-icon-container">{renderIcon(props.icon)}</div>
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
