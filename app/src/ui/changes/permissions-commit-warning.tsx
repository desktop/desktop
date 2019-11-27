import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { FoldoutType } from '../../lib/app-state'

interface IPermissionsCommitWarningProps {
  readonly dispatcher: Dispatcher
  readonly currentBranch: string
  readonly repositoryName: string
  readonly hasWritePermissionForRepository: boolean
  readonly currentBranchProtected: boolean
}

/** A warning for the user if they won't be able to push to a branch,
 *  either because its a *protected branch* or they don't have *write
 *  permission* for the repository.
 *
 * (If neither of those conditions are met, this component renders nothing.)
 */
export class PermissionsCommitWarning extends React.Component<
  IPermissionsCommitWarningProps
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
    if (
      this.props.hasWritePermissionForRepository &&
      !this.props.currentBranchProtected
    ) {
      return null
    }

    return (
      <div
        id="permissions-commit-warning"
        onContextMenu={this.ignoreContextMenu}
      >
        <div className="warning-icon-container">
          <Octicon className="warning-icon" symbol={OcticonSymbol.alert} />
        </div>
        <div className="warning-message">{this.renderWarningMesage()}</div>
      </div>
    )
  }

  private renderWarningMesage() {
    if (!this.props.hasWritePermissionForRepository) {
      return <ReadonlyRepoMessage name={this.props.repositoryName} />
    }
    if (this.props.currentBranchProtected) {
      return (
        <ProtectedBranchMessage
          currentBranch={this.props.currentBranch}
          onSwitchBranch={this.onSwitchBranch}
        />
      )
    }
    return <></>
  }
}

const ReadonlyRepoMessage: React.SFC<{
  name: string
}> = props => {
  return (
    <>
      You do not have permission to push to <strong>{props.name}</strong>.
    </>
  )
}

const ProtectedBranchMessage: React.SFC<{
  currentBranch: string
  onSwitchBranch: () => void
}> = props => {
  return (
    <>
      <strong>{props.currentBranch}</strong> is a protected branch. Want to{' '}
      <LinkButton onClick={props.onSwitchBranch}>switch branches</LinkButton>?
    </>
  )
}
