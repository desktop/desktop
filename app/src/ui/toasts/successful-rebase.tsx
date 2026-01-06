import * as React from 'react'
import { SuccessToast } from './success-toast'

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
        {' onto '}
        <strong>{baseBranch}</strong>
      </span>
    ) : (
      <span>
        {'Successfully rebased '}
        <strong>{targetBranch}</strong>
      </span>
    )

  return (
    <SuccessToast timeout={5000} onDismissed={onDismissed}>
      <div className="toast-message">{message}</div>
    </SuccessToast>
  )
}
