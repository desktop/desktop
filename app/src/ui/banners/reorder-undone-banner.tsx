import * as React from 'react'
import { SuccessBanner } from './success-banner'

export function ReorderUndone({
  commitsCount,
  onDismissed,
}: {
  readonly commitsCount: number
  readonly onDismissed: () => void
}) {
  const pluralized = commitsCount === 1 ? 'commit' : 'commits'

  return (
    <SuccessBanner timeout={5000} onDismissed={onDismissed}>
      Reorder of {commitsCount} {pluralized} undone.
    </SuccessBanner>
  )
}
