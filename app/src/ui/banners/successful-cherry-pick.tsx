import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

export function SuccessfulCherryPick({
  targetBranchName,
  countCherryPicked,
  onDismissed,
}: {
  readonly targetBranchName: string
  readonly countCherryPicked: number
  readonly onDismissed: () => void
}) {
  const pluralized = countCherryPicked === 1 ? 'commit' : 'commits'
  return (
    <Banner
      id="successful-cherry-pick"
      timeout={7500}
      onDismissed={onDismissed}
    >
      <div className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </div>
      <div className="banner-message">
        <span>
          Successfully copied {countCherryPicked} {pluralized} to{' '}
          <strong>{targetBranchName}</strong>.
        </span>
      </div>
    </Banner>
  )
}
