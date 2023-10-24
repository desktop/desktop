import * as React from 'react'
import { SuccessBanner } from './success-banner'

export function SuccessfulReorder({
  commitsCount,
  onDismissed,
  onUndo,
}: {
  commitsCount: number
  onDismissed: () => void
  onUndo: () => void
}) {
  const pluralized = commitsCount === 1 ? 'commit' : 'commits'

  return (
    <SuccessBanner timeout={15000} onDismissed={onDismissed} onUndo={onUndo}>
      <span>
        Successfully reordered {commitsCount} {pluralized}.
      </span>
    </SuccessBanner>
  )
}
