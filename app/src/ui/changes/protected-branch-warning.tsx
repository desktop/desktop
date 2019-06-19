import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'

interface IProtectedBranchWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly currentBranch: string
}

export class ProtectedBranchWarning extends React.Component<
  IProtectedBranchWarningProps
> {
  private onSwitchBranch = () => {
    this.props.dispatcher.moveChangesToAnotherBranch(this.props.repository)
  }

  public render() {
    return (
      <div id="protected-branch">
        <div className="protected-branch-icon-container">
          <Octicon
            className="protected-branch-icon"
            symbol={OcticonSymbol.alert}
          />
        </div>

        <div className="warning-message">
          <strong>{this.props.currentBranch}</strong> is a protected branch.
          Want to{' '}
          <LinkButton onClick={this.onSwitchBranch}>switch branches</LinkButton>
          ?
        </div>
      </div>
    )
  }
}
