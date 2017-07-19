import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../models/branch'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Ref } from '../lib/ref'

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

  return numberOfCommits === 1
    ? `${numberOfCommits} ${unit}`
    : `${numberOfCommits} ${unit}s`
}

/**
 * Simple type guard which allows us to substitute the non-obvious
 * this.props.unPushedCommits === undefined checks with
 * renderPublishView(this.props.unPushedCommits).
 */
function renderPublishView(
  unPushedCommits: number | undefined
): unPushedCommits is undefined {
  return unPushedCommits === undefined
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
        {this.renderDialogContent()}

        <DialogFooter>
          {this.renderButtonGroup()}
        </DialogFooter>
      </Dialog>
    )
  }

  private renderDialogContent() {
    if (renderPublishView(this.props.unPushedCommits)) {
      return (
        <DialogContent>
          <p>Your branch must be published before opening a pull request.</p>
          <p>
            Would you like to publish <Ref>{this.props.branch.name}</Ref> and
            open a pull request?
          </p>
        </DialogContent>
      )
    }

    const commits = pluralizeCommits(this.props.unPushedCommits)

    return (
      <DialogContent>
        <p>
          You have {commits} local commits that haven't been pushed to the
          remote.
        </p>
        <p>
          Would you like to push your changes to{' '}
          <Ref>{this.props.branch.name}</Ref> before creating your pull request?
        </p>
      </DialogContent>
    )
  }

  private renderDialogTitle() {
    if (renderPublishView(this.props.unPushedCommits)) {
      return __DARWIN__ ? 'Publish Branch' : 'Publish branch'
    }

    const commits = pluralizeCommits(this.props.unPushedCommits, true)

    return __DARWIN__
      ? `Your Branch is Ahead by ${commits}`
      : `Your branch is ahead by ${commits}`
  }

  private renderButtonGroup() {
    if (renderPublishView(this.props.unPushedCommits)) {
      const buttonText = __DARWIN__
        ? 'Publish Branch and Open Pull Request'
        : 'Publish branch and open pull request'

      return (
        <ButtonGroup destructive={true}>
          <Button type="submit">Cancel</Button>
          <Button onClick={this.onPushOrPublishButtonClick}>
            {buttonText}
          </Button>
        </ButtonGroup>
      )
    }

    return (
      <ButtonGroup destructive={true}>
        <Button type="submit" onClick={this.onCreateWithoutPushButtonClick}>
          No
        </Button>
        <Button onClick={this.onPushOrPublishButtonClick}>Yes</Button>
      </ButtonGroup>
    )
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private onCreateWithoutPushButtonClick(
    e: React.MouseEvent<HTMLButtonElement>
  ) {
    e.preventDefault()

    this.props.onConfirm(this.props.repository, this.props.branch)
    this.props.onDismissed()
  }

  private onPushOrPublishButtonClick = async () => {
    const { repository, branch } = this.props

    this.setState({ loading: true })

    try {
      await this.props.dispatcher.push(repository)
    } finally {
      this.setState({ loading: false })
    }

    this.props.onConfirm(repository, branch)
    this.props.onDismissed()
  }
}
