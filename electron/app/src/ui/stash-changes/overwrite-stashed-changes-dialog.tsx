import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'

interface IOverwriteStashProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branchToCheckout: Branch | null
  readonly onDismissed: () => void
}

interface IOverwriteStashState {
  readonly isLoading: boolean
}

/**
 * Dialog that alerts user that their stash will be overwritten
 */
export class OverwriteStash extends React.Component<
  IOverwriteStashProps,
  IOverwriteStashState
> {
  public constructor(props: IOverwriteStashProps) {
    super(props)
    this.state = { isLoading: false }
  }

  public render() {
    const title = __DARWIN__ ? 'Overwrite Stash?' : 'Overwrite stash?'

    return (
      <Dialog
        id="overwrite-stash"
        type="warning"
        title={title}
        loading={this.state.isLoading}
        disabled={this.state.isLoading}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        role="alertdialog"
        ariaDescribedBy="overwrite-stash-warning-message"
      >
        <DialogContent>
          <Row id="overwrite-stash-warning-message">
            Are you sure you want to proceed? This will overwrite your existing
            stash with your current changes.
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Overwrite" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, branchToCheckout, onDismissed } = this.props
    this.setState({ isLoading: true })

    try {
      if (branchToCheckout !== null) {
        const strategy = UncommittedChangesStrategy.StashOnCurrentBranch
        await dispatcher.checkoutBranch(repository, branchToCheckout, strategy)
      } else {
        await dispatcher.createStashForCurrentBranch(repository, false)
      }
    } finally {
      this.setState({ isLoading: false })
    }

    onDismissed()
  }
}
