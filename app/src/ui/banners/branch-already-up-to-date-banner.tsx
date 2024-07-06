import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Banner } from './banner'

export function BranchAlreadyUpToDate({
  ourBranch,
  theirBranch,
  onDismissed,
}: {
  readonly ourBranch: string
  readonly theirBranch?: string
  readonly onDismissed: () => void
}) {
  const message =
    theirBranch !== undefined ? (
      <span>
        <strong>{ourBranch}</strong>
        {' is already up to date with '}
        <strong>{theirBranch}</strong>
      </span>
    ) : (
      <span>
        <strong>{ourBranch}</strong>
        {' is already up to date'}
      </span>
    )

  return (
    <Banner id="successful-merge" timeout={5000} onDismissed={onDismissed}>
      <div className="green-circle">
        <Octicon className="check-icon" symbol={octicons.check} />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
