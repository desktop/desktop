import * as React from 'react'
import { SuccessToast } from './success-toast'

interface ISuccessfulCherryPickToastProps {
  readonly targetBranchName: string
  readonly countCherryPicked: number
  readonly onDismissed: () => void
  readonly onUndo: () => void
}

export class SuccessfulCherryPick extends React.Component<
  ISuccessfulCherryPickToastProps,
  {}
> {
  public render() {
    const { countCherryPicked, onDismissed, onUndo, targetBranchName } =
      this.props

    const pluralized = countCherryPicked === 1 ? 'commit' : 'commits'

    return (
      <SuccessToast timeout={15000} onDismissed={onDismissed} onUndo={onUndo}>
        <span>
          Successfully copied {countCherryPicked} {pluralized} to{' '}
          <strong>{targetBranchName}</strong>.
        </span>
      </SuccessToast>
    )
  }
}
