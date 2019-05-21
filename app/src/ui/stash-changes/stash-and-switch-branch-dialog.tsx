import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import { Row } from '../lib/row'
import { Branch } from '../../models/branch'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import {
  UncommittedChangesAction,
  StashContext,
  getBranchName,
  CheckoutAction,
} from '../../models/uncommitted-changes-strategy'
import { Octicon, OcticonSymbol } from '../octicons'
import { PopupType } from '../../models/popup'
import { WorkingDirectoryStatus, AppFileStatusKind } from '../../models/status'

interface ISwitchBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch

  /** Status for this repository */
  readonly workingDirectory: WorkingDirectoryStatus

  /** The branch to checkout after the user selects a stash action */
  readonly stashContext: StashContext

  /** Whether `currentBranch` has an existing stash association */
  readonly hasAssociatedStash: boolean

  readonly onDismissed: () => void
}

interface ISwitchBranchState {
  readonly isStashingChanges: boolean
  readonly uncommittedChangesAction: UncommittedChangesAction
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
      uncommittedChangesAction: UncommittedChangesAction.StashOnCurrentBranch,
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
          <ButtonGroup>
            <Button type="submit">
              {__DARWIN__ ? 'Switch Branch' : 'Switch branch'}
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderStashOverwriteWarning() {
    if (
      !this.props.hasAssociatedStash ||
      this.state.uncommittedChangesAction !==
        UncommittedChangesAction.StashOnCurrentBranch
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
    const items = [
      {
        title: `Leave my changes on ${this.state.currentBranchName}`,
        description:
          'Your in-progress work will be stashed on this branch for you to return to later',
      },
      {
        title: `Bring my changes to ${getBranchName(this.props.stashContext)}`,
        description: 'Your in-progress work will follow you to the new branch',
      },
    ]

    return (
      <Row>
        <VerticalSegmentedControl
          label="You have changes on this branch. What would you like to do with them?"
          items={items}
          selectedIndex={this.state.uncommittedChangesAction}
          onSelectionChanged={this.onSelectionChanged}
        />
      </Row>
    )
  }

  private onSelectionChanged = (action: UncommittedChangesAction) => {
    this.setState({ uncommittedChangesAction: action })
  }

  private onSubmit = async () => {
    const {
      repository,
      dispatcher,
      hasAssociatedStash,
      stashContext: branchAction,
    } = this.props

    if (
      this.state.uncommittedChangesAction ===
        UncommittedChangesAction.StashOnCurrentBranch &&
      hasAssociatedStash
    ) {
      dispatcher.showPopup({
        type: PopupType.ConfirmOverwriteStash,
        repository,
        stashContext: branchAction,
      })
      return
    }

    this.setState({ isStashingChanges: true })

    try {
      await this.stashAndCheckout()
    } finally {
      this.setState({ isStashingChanges: false }, () => {
        this.props.onDismissed()
      })
    }
  }

  private async stashAndCheckout() {
    const { repository, stashContext, dispatcher } = this.props
    const { uncommittedChangesAction } = this.state
    const hasDeletedChanges = this.props.workingDirectory.files.some(f => {
      f.status.kind === AppFileStatusKind.Deleted
    })

    if (stashContext.kind === CheckoutAction.Checkout && hasDeletedChanges) {
      await dispatcher.completeMoveToBranch(
        repository,
        uncommittedChangesAction,
        stashContext
      )
    } else {
      const branchName =
        stashContext.kind === CheckoutAction.Checkout
          ? stashContext.branch.name
          : stashContext.branchName
      await dispatcher.checkoutBranch(repository, branchName)
    }
  }
}
