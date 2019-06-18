import * as React from 'react'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'

interface IProtectedBranchWarningProps {
  readonly currentBranch: string
}

export class ProtectedBranchWarning extends React.Component<
  IProtectedBranchWarningProps
> {
  private onSwitchBranch = () => {
    // TODO: wire up event handler to fire and move to a new branch
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

        <Button type="submit" className="commit-button">
          <span>
            Commit to <strong>{this.props.currentBranch}</strong> anyway...
          </span>
        </Button>
      </div>
    )
  }
}
