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
   *
   * @type {number}
   * @memberof IPushBranchCommitsProps
   */
  readonly unPushedCommits?: number
}

/**
 * This component gets shown if the user attempts to open a PR with
 * a) An un-published branch
 * b) A branch that is ahead of its base branch
 *
 * In both cases, this asks the user if they'd like to push/publish the branch.
 * If they confirm we push/publish then open the PR page on dotcom.
 *
 * @export
 * @class PushBranchCommits
 * @extends {React.Component<IPushBranchCommitsProps>}
 */
export class PushBranchCommits extends React.Component<
  IPushBranchCommitsProps
> {
  private isPublish: boolean

  public constructor(props: IPushBranchCommitsProps) {
    super(props)

    this.isPublish = props.unPushedCommits === undefined
  }

  public render() {
    return (
      <Dialog
        id="push-branch-commits"
        key="push-branch-commits"
        title={this.renderDialogTitle()}
        onDismissed={this.cancel}
        onSubmit={this.cancel}
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
    if (this.isPublish) {
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
        {`Would you like to push ${numberOfCommits} ${this.createCommitString()} to `}
        <b>{this.props.branch.name}</b> and open a pull request?
      </p>
    )
  }

  private renderDialogTitle() {
    if (this.isPublish) {
      return __DARWIN__ ? 'Publish Branch' : 'Publish branch'
    }

    const numberOfCommits = this.props.unPushedCommits

    return __DARWIN__
      ? `Your Branch is Ahead by ${numberOfCommits} ${this.createCommitString(
          true
        )}`
      : `Your branch is ahead by ${numberOfCommits} ${this.createCommitString(
          true
        )}`
  }

  private renderButtonText() {
    if (this.isPublish) {
      return __DARWIN__
        ? 'Publish Branch and Open Pull Request'
        : 'Publish branch and open pull request'
    }

    return __DARWIN__
      ? 'Push Commits and Open Pull Request'
      : 'Push commits and open pull request'
  }

  private createCommitString(platformize: boolean = false) {
    const numberOfCommits = this.props.unPushedCommits
    const pluralize = numberOfCommits !== 1

    let result = 'commit'

    if (platformize && __DARWIN__) {
      result = 'Commit'
    }

    if (pluralize) {
      result += 's'
    }

    return result
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private push = async () => {
    const props = this.props

    await this.props.dispatcher.push(props.repository)
    this.props.onConfirm(props.repository, props.branch)
    this.props.onDismissed()
  }
}
