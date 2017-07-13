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
  readonly publish?: boolean
  readonly unPushedCommits?: number
  readonly onConfirm: (repository: Repository, branch: Branch) => void
  readonly onDismissed: () => void
}

export class PushBranchCommits extends React.Component<
  IPushBranchCommitsProps
> {
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
    if (this.props.publish) {
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
    if (this.props.publish) {
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
    if (this.props.publish) {
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
