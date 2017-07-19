import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../models/branch'
import { ButtonGroup } from '../../ui/lib/button-group'
import { Button } from '../../ui/lib/button'
import { Dialog, DialogContent, DialogFooter } from '../../ui/dialog'
import { Repository } from '../../models/repository'

interface IPushBranchCommitsProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly onConfirm: (repository: Repository, branch: Branch) => void
  readonly onDismissed: () => void

  /**
   * Used to show the number of commits a branch is ahead by.
   * If this value is undefined, component defaults to publish view.
   */
  readonly unPushedCommits?: number
}

interface IPushBranchCommitsState {
  /**
   * A value indicating whether we're currently working on publishing
   * or pushing the branch to the remote. This value is used to tell
   * the dialog to apply the loading state which adds a spinner and
   * disables form controls for the duration of the operation.
   */
  readonly loading: boolean
}

/**
 * Returns a string used for communicating the number of commits
 * that will be pushed to the user. If only one commit is to be pushed
 * we return the singular 'commit', if any other amount of commits
 * are to be pushed we return the plural 'commits'. If the
 * capitalize parameter is true we'll capitalize the 'c' in commit
 * on macOS.
 *
 * @param numberOfCommits The number of commits that will be pushed
 * @param capitalize      Whether or not to capitalize the unit (commit)
 *                        on macOS
 */
function pluralizeCommits(
  numberOfCommits: number,
  capitalize: boolean = false
) {
  const unit = __DARWIN__ && capitalize ? 'Commit' : 'commit'
  return numberOfCommits === 1 ? unit : `${unit}s`
}

/**
 * This component gets shown if the user attempts to open a PR with
 * a) An un-published branch
 * b) A branch that is ahead of its base branch
 *
 * In both cases, this asks the user if they'd like to push/publish the branch.
 * If they confirm we push/publish then open the PR page on dotcom.
 */
export class PushBranchCommits extends React.Component<
  IPushBranchCommitsProps,
  IPushBranchCommitsState
> {
  public constructor(props: IPushBranchCommitsProps) {
    super(props)

    this.state = { loading: false }
  }

  public render() {
    return (
      <Dialog
        id="push-branch-commits"
        key="push-branch-commits"
        title={this.renderDialogTitle()}
        onDismissed={this.cancel}
        onSubmit={this.cancel}
        loading={this.state.loading}
      >
        <DialogContent>
          {this.renderDialogContent()}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Cancel</Button>
            <Button onClick={this.push}>
              {this.renderButtonText()}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderDialogContent() {
    if (this.props.unPushedCommits === undefined) {
      return (
        <p>
          Your branch must be published before opening a pull request. Would you
          like to publish <b>{this.props.branch.name}</b> and open a pull
          request?
        </p>
      )
    }

    const numberOfCommits = this.props.unPushedCommits

    return (
      <p>
        {`Would you like to push ${numberOfCommits} ${pluralizeCommits(
          numberOfCommits
        )} to `}
        <b>{this.props.branch.name}</b> and open a pull request?
      </p>
    )
  }

  private renderDialogTitle() {
    if (this.props.unPushedCommits === undefined) {
      return __DARWIN__ ? 'Publish Branch' : 'Publish branch'
    }

    const numberOfCommits = this.props.unPushedCommits

    return __DARWIN__
      ? `Your Branch is Ahead by ${numberOfCommits} ${pluralizeCommits(
          numberOfCommits,
          true
        )}`
      : `Your branch is ahead by ${numberOfCommits} ${pluralizeCommits(
          numberOfCommits,
          true
        )}`
  }

  private renderButtonText() {
    if (this.props.unPushedCommits === undefined) {
      return __DARWIN__
        ? 'Publish Branch and Open Pull Request'
        : 'Publish branch and open pull request'
    }

    return __DARWIN__
      ? 'Push Commits and Open Pull Request'
      : 'Push commits and open pull request'
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private push = async () => {
    const props = this.props

    this.setState({ loading: true })

    try {
      await this.props.dispatcher.push(props.repository)
    } finally {
      this.setState({ loading: false })
    }

    this.props.onConfirm(props.repository, props.branch)
    this.props.onDismissed()
  }
}
