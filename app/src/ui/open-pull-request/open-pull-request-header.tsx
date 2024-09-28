import * as React from 'react'
import { Branch } from '../../models/branch'
import { BranchSelect } from '../branches/branch-select'
import { DialogHeader } from '../dialog/header'
import { Ref } from '../lib/ref'

export const OpenPullRequestDialogId = 'Dialog_Open_Pull_Request'

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
   * Branches in the repo with the repo's default remote
   *
   * We only want branches that are also on dotcom such that, when we ask a user
   * to create a pull request, the base branch also exists on dotcom.
   */
  readonly prBaseBranches: ReadonlyArray<Branch>

  /**
   * Recent branches with the repo's default remote
   *
   * We only want branches that are also on dotcom such that, when we ask a user
   * to create a pull request, the base branch also exists on dotcom.
   */
  readonly prRecentBaseBranches: ReadonlyArray<Branch>

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

/**
 * A header component for the open pull request dialog. Made to house the
 * base branch dropdown and merge details common to all pull request views.
 */
export class OpenPullRequestDialogHeader extends React.Component<IOpenPullRequestDialogHeaderProps> {
  public constructor(props: IOpenPullRequestDialogHeaderProps) {
    super(props)
  }

  public render() {
    const title = __DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'
    const {
      baseBranch,
      currentBranch,
      defaultBranch,
      prBaseBranches,
      prRecentBaseBranches,
      commitCount,
      onBranchChange,
      onDismissed,
    } = this.props
    const commits = `${commitCount} commit${commitCount > 1 ? 's' : ''}`

    return (
      <DialogHeader
        title={title}
        titleId={OpenPullRequestDialogId}
        onCloseButtonClick={onDismissed}
      >
        <div className="break"></div>
        <div className="base-branch-details">
          Merge {commits} into{' '}
          <BranchSelect
            branch={baseBranch}
            defaultBranch={defaultBranch}
            currentBranch={currentBranch}
            allBranches={prBaseBranches}
            recentBranches={prRecentBaseBranches}
            onChange={onBranchChange}
            noBranchesMessage={
              <>
                <p>Sorry, I can't find that remote branch.</p>
                <p>You can only open pull requests against remote branches.</p>
              </>
            }
          />{' '}
          from <Ref>{currentBranch.name}</Ref>.
        </div>
      </DialogHeader>
    )
  }
}
