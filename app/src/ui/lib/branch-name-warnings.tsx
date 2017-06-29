import * as React from 'react'

import { Row } from './row'
import { Octicon, OcticonSymbol } from '../octicons'

function renderWarningMessage(message: string) {
  return (
    <Row className="warning-helper-text">
      <Octicon symbol={OcticonSymbol.alert} />
      {message}
    </Row>
  )
}

export function renderBranchNameWarning(
  proposedName: string,
  sanitizedName: string
) {
  if (/^\s+$/.test(proposedName)) {
    return renderWarningMessage('Branch name cannot be empty')
  } else if (proposedName !== sanitizedName) {
    return renderWarningMessage(`Will be created as ${sanitizedName}`)
  } else {
    return null
  }
}
