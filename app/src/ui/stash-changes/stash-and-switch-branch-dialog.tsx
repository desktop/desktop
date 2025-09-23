import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import { Row } from '../lib/row'
import { Branch } from '../../models/branch'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { startTimer } from '../lib/timing'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

enum StashAction {
  StashOnCurrentBranch,
  MoveToNewBranch,
}

interface ISwitchBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch

  /** The branch to checkout after the user selects a stash action */
  readonly branchToCheckout: Branch

  readonly onDismissed: () => void
}

interface ISwitchBranchState {
  readonly isStashingChanges: boolean
  readonly selectedStashAction: StashAction
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
      selectedStashAction: StashAction.StashOnCurrentBranch,
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
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Switch Branch' : 'Switch branch'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  // No overwrite warning needed now that multiple stashes are supported

  private renderStashActions() {
    const { branchToCheckout } = this.props
    const items = [
      {
        title: `Leave my changes on ${this.state.currentBranchName}`,
        description:
          'Your in-progress work will be stashed on this branch for you to return to later',
        key: StashAction.StashOnCurrentBranch,
      },
      {
        title: `Bring my changes to ${branchToCheckout.name}`,
        description: 'Your in-progress work will follow you to the new branch',
        key: StashAction.MoveToNewBranch,
      },
    ]

    return (
      <Row>
        <VerticalSegmentedControl
          label="You have changes on this branch. What would you like to do with them?"
          items={items}
          selectedKey={this.state.selectedStashAction}
          onSelectionChanged={this.onSelectionChanged}
        />
      </Row>
    )
  }

  private onSelectionChanged = (action: StashAction) => {
    this.setState({ selectedStashAction: action })
  }

  private onSubmit = async () => {
    const { repository, branchToCheckout, dispatcher } =
      this.props
    const { selectedStashAction } = this.state

    // Previously we prompted for overwrite confirmation if a stash existed.
    // We now keep multiple stashes per branch, so proceed without confirmation.

    this.setState({ isStashingChanges: true })

    const timer = startTimer('stash and checkout', repository)
    try {
      if (selectedStashAction === StashAction.StashOnCurrentBranch) {
        await dispatcher.checkoutBranch(
          repository,
          branchToCheckout,
          UncommittedChangesStrategy.StashOnCurrentBranch
        )
      } else if (selectedStashAction === StashAction.MoveToNewBranch) {
        // attempt to checkout the branch without creating a stash entry
        await dispatcher.checkoutBranch(
          repository,
          branchToCheckout,
          UncommittedChangesStrategy.MoveToNewBranch
        )
      }
    } finally {
      timer.done()
      this.setState({ isStashingChanges: false }, () => {
        this.props.onDismissed()
      })
    }
  }
}
