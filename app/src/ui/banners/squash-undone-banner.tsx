import * as React from 'react'
import { SuccessBanner } from './success-banner'

export function SquashUndone({
  commitsCount,
  onDismissed,
}: {
  commitsCount: number
  onDismissed: () => void
}) {
  const pluralized = commitsCount === 1 ? 'commit' : 'commits'

  return (
    <SuccessBanner timeout={5000} onDismissed={onDismissed}>
      Squash of {commitsCount} {pluralized} undone.
    </SuccessBanner>
  )
}
