import * as React from 'react'
import { Branch } from '../../models/branch'
import { BranchSelect } from '../branches/branch-select'
import { DialogHeader } from '../dialog/header'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { Ref } from '../lib/ref'

interface IOpenPullRequestDialogHeaderProps {
  /** The base branch of the pull request */
  readonly baseBranch: Branch | null

  /** The branch of the pull request */
  readonly currentBranch: Branch

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /** The count of commits of the pull request */
  readonly commitCount: number

  /** When the branch selection changes */
  readonly onBranchChange: (branch: Branch) => void

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the dismissable prop.
   */
  readonly onDismissed?: () => void
}

interface IOpenPullRequestDialogHeaderState {
  /**
   * An id for the h1 element that contains the title of this dialog. Used to
   * aid in accessibility by allowing the h1 to be referenced in an
   * aria-labeledby/aria-describedby attributed. Undefined if the dialog does
   * not have a title or the component has not yet been mounted.
   */
  readonly titleId: string
}

/**
 * A header component for the open pull request dialog. Made to house the
 * base branch dropdown and merge details common to all pull request views.
 */
export class OpenPullRequestDialogHeader extends React.Component<
  IOpenPullRequestDialogHeaderProps,
  IOpenPullRequestDialogHeaderState
> {
  public constructor(props: IOpenPullRequestDialogHeaderProps) {
    super(props)
    this.state = { titleId: createUniqueId(`Dialog_Open_Pull_Request`) }
  }

  public componentWillUnmount() {
    releaseUniqueId(this.state.titleId)
  }

  public render() {
    const title = __DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'
    const {
      baseBranch,
      currentBranch,
      defaultBranch,
      allBranches,
      recentBranches,
      commitCount,
      onBranchChange,
      onDismissed,
    } = this.props
    const commits = `${commitCount} commit${commitCount > 1 ? 's' : ''}`

    return (
      <DialogHeader
        title={title}
        titleId={this.state.titleId}
        dismissable={true}
        onDismissed={onDismissed}
      >
        <div className="break"></div>
        <div className="base-branch-details">
          Merge {commits} into{' '}
          <BranchSelect
            branch={baseBranch}
            defaultBranch={defaultBranch}
            currentBranch={currentBranch}
            allBranches={allBranches}
            recentBranches={recentBranches}
            onChange={onBranchChange}
          />{' '}
          from <Ref>{currentBranch.name}</Ref>.
        </div>
      </DialogHeader>
    )
  }
}
