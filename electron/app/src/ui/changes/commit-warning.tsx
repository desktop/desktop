import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

export enum CommitWarningIcon {
  Warning,
  Information,
  Error,
}

const renderIcon = (icon: CommitWarningIcon) => {
  let className = ''
  let symbol = octicons.alert

  switch (icon) {
    case CommitWarningIcon.Warning:
      className = 'warning-icon'
      symbol = octicons.alert
      break
    case CommitWarningIcon.Information:
      className = 'information-icon'
      symbol = octicons.info
      break
    case CommitWarningIcon.Error:
      className = 'error-icon'
      symbol = octicons.stop
      break
    default:
      assertNever(icon, `Unexpected icon value ${icon}`)
  }

  return <Octicon className={className} symbol={symbol} />
}

/** A warning displayed above the commit button
 */
export const CommitWarning: React.FunctionComponent<{
  readonly icon: CommitWarningIcon
}> = props => {
  return (
    <div className="commit-warning-component" onContextMenu={ignoreContextMenu}>
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
