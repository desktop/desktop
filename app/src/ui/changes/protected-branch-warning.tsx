import * as React from 'react'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'

interface IProtectedBranchWarningProps {
  readonly currentBranch: string
}

export class ProtectedBranchWarning extends React.Component<
  IProtectedBranchWarningProps
> {
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
          You can't commit to <strong>{this.props.currentBranch}</strong>{' '}
          because it's a protected branch.
        </div>

        <Button type="submit" className="commit-button" disabled={true}>
          <span>Switch branch...</span>
        </Button>
      </div>
    )
  }
}
