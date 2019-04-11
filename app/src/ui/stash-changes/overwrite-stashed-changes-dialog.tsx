import React = require('react')
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { Row } from '../lib/row'

interface IOverwriteStashProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branchToCheckout: Branch
  readonly onDismissed: () => void
}

export class OverwriteStash extends React.Component<
  IOverwriteStashProps,
  IOverwriteStashState
> {
  public render() {
    const title = __DARWIN__ ? 'Overwrite Stash?' : 'Overwrite stash?'

    return (
      <Dialog
        id="overwrite-stash"
        title={title}
        onDismissed={this.props.onDismissed}
        type="warning"
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <Row>
            Clear or restore your current stash before continuing, or your
            current stash will be overwritten.
          </Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Continue</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, branchToCheckout, onDismissed } = this.props

    await dispatcher.checkoutBranch(
      repository,
      branchToCheckout,
      UncommittedChangesStrategy.stashOnCurrentBranch
    )
    onDismissed()
  }
}
