import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import { Row } from '../lib/row'
import { Branch } from '../../models/branch'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { Octicon, OcticonSymbol } from '../octicons'
import { PopupType } from '../../models/popup'
import { startTimer } from '../lib/timing'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

enum ExistingChangesAction {
  StashOnCurrentBranch,
  MoveToNewBranch,
  DiscardAllChanges,
}

interface ISwitchBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch

  /** The branch to checkout after the user selects a stash action */
  readonly branchToCheckout: Branch

  /** Whether `currentBranch` has an existing stash association */
  readonly hasAssociatedStash: boolean
  readonly onDismissed: () => void
}

interface ISwitchBranchState {
  readonly isStashingChanges: boolean
  readonly selectedAction: ExistingChangesAction
  readonly currentBranchName: string
}

/**
 * Dialog that alerts users that their changes may be lost and offers them the
 * chance to stash them or potentially take them to another branch
 */
export class StashAndSwitchBranch extends React.Component<
  ISwitchBranchProps,
  ISwitchBranchState
> {
  public constructor(props: ISwitchBranchProps) {
    super(props)

    this.state = {
      isStashingChanges: false,
      selectedAction: ExistingChangesAction.StashOnCurrentBranch,
      currentBranchName: props.currentBranch.name,
    }
  }

  public render() {
    const { isStashingChanges } = this.state
    return (
      <Dialog
        id="stash-changes"
        title={__DARWIN__ ? 'Switch Branch' : 'Switch branch'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={isStashingChanges}
        disabled={isStashingChanges}
      >
        <DialogContent>
          {this.renderStashActions()}
          {this.renderStashOverwriteWarning()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Switch Branch' : 'Switch branch'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderStashOverwriteWarning() {
    if (
      !this.props.hasAssociatedStash ||
      this.state.selectedAction !== ExistingChangesAction.StashOnCurrentBranch
    ) {
      return null
    }

    return (
      <Row>
        <Octicon symbol={OcticonSymbol.alert} /> Your current stash will be
        overwritten by creating a new stash
      </Row>
    )
  }

  private renderStashActions() {
    const { branchToCheckout } = this.props
    const items = [
      {
        title: `Leave my changes on ${this.state.currentBranchName}`,
        description:
          'Your in-progress work will be stashed on this branch for you to return to later',
        key: ExistingChangesAction.StashOnCurrentBranch,
      },
      {
        title: `Bring my changes to ${branchToCheckout.name}`,
        description: 'Your in-progress work will follow you to the new branch',
        key: ExistingChangesAction.MoveToNewBranch,
      },
      {
        title: `Discard all changes`,
        description: 'Changes can be restored by retrieving them from the Recycle Bin',
        key: ExistingChangesAction.DiscardAllChanges,
      },
    ]

    return (
      <Row>
        <VerticalSegmentedControl
          label="You have changes on this branch. What would you like to do with them?"
          items={items}
          selectedKey={this.state.selectedAction}
          onSelectionChanged={this.onSelectionChanged}
        />
      </Row>
    )
  }

  private onSelectionChanged = (action: ExistingChangesAction) => {
    this.setState({ selectedAction: action })
  }

  private onSubmit = async () => {
    const {
      repository,
      branchToCheckout,
      dispatcher,
      hasAssociatedStash,
    } = this.props
    const { selectedAction } = this.state

    if (
      selectedAction === ExistingChangesAction.StashOnCurrentBranch &&
      hasAssociatedStash
    ) {
      dispatcher.showPopup({
        type: PopupType.ConfirmOverwriteStash,
        repository,
        branchToCheckout,
      })
      return
    }

    this.setState({ isStashingChanges: true })

    const timer = startTimer('checkout', repository)
    try {
      let strategy = UncommittedChangesStrategy.AskForConfirmation;
      if (selectedAction === ExistingChangesAction.StashOnCurrentBranch){
        strategy = UncommittedChangesStrategy.StashOnCurrentBranch;
      }
      else if (selectedAction === ExistingChangesAction.MoveToNewBranch){
        strategy = UncommittedChangesStrategy.MoveToNewBranch; // attempt to checkout the branch without creating a stash entry
      }
      else if (selectedAction === ExistingChangesAction.DiscardAllChanges){
        strategy = UncommittedChangesStrategy.DiscardAll;
      }
      await dispatcher.checkoutBranch(
        repository,
        branchToCheckout,
        strategy
      )
    } finally {
      timer.done()
      this.setState({ isStashingChanges: false }, () => {
        this.props.onDismissed()
      })
    }
  }
}
