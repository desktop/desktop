import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

export function SuccessfulCherryPick({
  targetBranchName,
  onDismissed,
}: {
  readonly targetBranchName: string
  readonly onDismissed: () => void
}) {
  const message = (
    <span>
      {'Successfully cherry picked commit to '}
      <strong>{targetBranchName}</strong>
    </span>
  )

  return (
    <Banner id="successful-rebase" timeout={7500} onDismissed={onDismissed}>
      <div className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
