import * as React from 'react'
import { SuccessToast } from './success-toast'

interface ICherryPickUndoneToastProps {
  readonly targetBranchName: string
  readonly countCherryPicked: number
  readonly onDismissed: () => void
}

export class CherryPickUndone extends React.Component<
  ICherryPickUndoneToastProps,
  {}
> {
  public render() {
    const { countCherryPicked, targetBranchName, onDismissed } = this.props
    const pluralized = countCherryPicked === 1 ? 'commit' : 'commits'
    return (
      <SuccessToast timeout={5000} onDismissed={onDismissed}>
        Cherry-pick undone. Successfully removed the {countCherryPicked}
        {' copied '}
        {pluralized} from <strong>{targetBranchName}</strong>.
      </SuccessToast>
    )
  }
}
