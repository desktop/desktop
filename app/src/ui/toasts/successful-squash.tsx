import * as React from 'react'
import { SuccessToast } from './success-toast'

interface ISuccessfulSquashedToastProps {
  readonly count: number
  readonly onDismissed: () => void
  readonly onUndo: () => void
}

export class SuccessfulSquash extends React.Component<
  ISuccessfulSquashedToastProps,
  {}
> {
  public render() {
    const { count, onDismissed, onUndo } = this.props

    const pluralized = count === 1 ? 'commit' : 'commits'

    return (
      <SuccessToast timeout={15000} onDismissed={onDismissed} onUndo={onUndo}>
        <span>
          Successfully squashed {count} {pluralized}.
        </span>
      </SuccessToast>
    )
  }
}
