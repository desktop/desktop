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
  readonly unPushedCommits: number
  readonly onDismissed: () => void
}

export class PushBranchCommits extends React.Component<IPushBranchCommitsProps> {
  public render() {
    return (
      <Dialog
        id="push-branch-commits"
        key="push-branch"
        title={
          __DARWIN__
            ? `You Have ${this.props.unPushedCommits} Commits`
            : `You have ${this.props.unPushedCommits} commits`
        }
        onDismissed={this.cancel}
        onSubmit={this.push}
      >
        <DialogContent>
          <p>
            The branch must be published before opening a PR. Would you like to
            publish <em>{this.props.branch.name}</em> and oepn a pull request?
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Psuh commits and open pull request</Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private push() {
    this.props.dispatcher.push(this.props.repository)
    this.props.onDismissed()
  }
}
