import * as React from 'react'

import { Row } from './row'
import { Octicon, OcticonSymbol } from '../octicons'
import { Ref } from './ref'

export function renderBranchNameWarning(
  proposedName: string,
  sanitizedName: string
) {
  if (proposedName.length > 0 && /^\s*$/.test(sanitizedName)) {
    return (
      <Row className="warning-helper-text">
        <Octicon symbol={OcticonSymbol.alert} />
        <p>
          <Ref>{proposedName}</Ref> is not a valid branch name.
        </p>
      </Row>
    )
  } else if (proposedName !== sanitizedName) {
    return (
      <Row className="warning-helper-text">
        <Octicon symbol={OcticonSymbol.alert} />
        <p>
          Will be created as <Ref>{sanitizedName}</Ref>.
        </p>
      </Row>
    )
  } else {
    return null
  }
}
