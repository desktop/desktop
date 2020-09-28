import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { FoldoutType } from '../../lib/app-state'

interface IProtectedBranchWarningProps {
  readonly dispatcher: Dispatcher
  readonly currentBranch: string
}

export class ProtectedBranchWarning extends React.Component<
  IProtectedBranchWarningProps
> {
  private onSwitchBranch = () => {
    this.props.dispatcher.showFoldout({
      type: FoldoutType.Branch,
      handleProtectedBranchWarning: true,
    })
  }

  private ignoreContextMenu = (event: React.MouseEvent<any>) => {
    // this prevents the context menu for the root element of CommitMessage from
    // firing - it shows 'Add Co-Authors' or 'Remove Co-Authors' based on the
    // form state, and for now I'm going to leave that behaviour as-is

    // feel free to remove this if that behaviour is revisited
    event.preventDefault()
  }

  public render() {
    return (
      <div id="protected-branch" onContextMenu={this.ignoreContextMenu}>
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
