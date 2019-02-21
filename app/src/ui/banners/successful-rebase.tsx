import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

export function SuccessfulRebase({
  baseBranch,
  targetBranch,
  onDismissed,
}: {
  readonly baseBranch?: string
  readonly targetBranch: string
  readonly onDismissed: () => void
}) {
  const message =
    baseBranch !== undefined ? (
      <span>
        {'Successfully rebased '}
        <strong>{targetBranch}</strong>
        {' on '}
        <strong>{baseBranch}</strong>
      </span>
    ) : (
      <span>
        {'Successfully rebased '}
        <strong>{targetBranch}</strong>
      </span>
    )

  return (
    <Banner id="successful-rebase" timeout={5000} onDismissed={onDismissed}>
      <div className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
