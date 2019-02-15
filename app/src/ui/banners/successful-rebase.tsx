import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

export function SuccessfulRebase({
  baseBranch,
  targetBranch,
  onDismissed,
}: {
  readonly baseBranch: string
  readonly targetBranch: string
  readonly onDismissed: () => void
}) {
  // TODO: make this message aware of the base branch (if we can resolve it)

  const message = (
    <span>
      {'Successfully rebased '}
      <strong>{targetBranch}</strong>
      {' on '}
      <strong>{baseBranch}</strong>
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
