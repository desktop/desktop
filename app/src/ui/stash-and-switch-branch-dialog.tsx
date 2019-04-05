import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from './dialog'
import { Repository } from '../models/repository'
import { Dispatcher } from './dispatcher'
import { VerticalSegmentedControl } from './lib/vertical-segmented-control'
import { Row } from './lib/row'
import { Branch } from '../models/branch'
import { ButtonGroup } from './lib/button-group'
import { Button } from './lib/button'

enum StashAction {
  KeepOnCurrentBranch,
  MoveToNewBranch,
}
interface ISwitchBranchProps {
  readonly repository: Repository
  readonly dispathcer: Dispatcher
  readonly currentBranch: Branch
  readonly branchToCheckout: Branch
  readonly onDismissed: () => void
}

interface ISwitchBranchState {
  readonly isStashingChanges: boolean
  readonly selectedStashAction: StashAction
}

export class StashAndSwitchBranch extends React.Component<
  ISwitchBranchProps,
  ISwitchBranchState
> {
  public constructor(props: ISwitchBranchProps) {
    super(props)

    this.state = {
      isStashingChanges: false,
      selectedStashAction: StashAction.KeepOnCurrentBranch,
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
        <DialogContent>{this.renderOptions()}</DialogContent>
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

  private renderOptions() {
    const { branchToCheckout } = this.props
    const items = [
      {
        title: `Yes, stash my changes from ${this.props.currentBranch.name}`,
        description: 'Stash your in-progress work and return to it later',
      },
      {
        title: `No, bring my changes to ${branchToCheckout.name}`,
        description:
          'your in-progress work will automatically follow you to the new branch',
      },
    ]

    return (
      <Row>
        <VerticalSegmentedControl
          label="Do you want to stash your changes?"
          items={items}
          selectedIndex={this.state.selectedStashAction}
          onSelectionChanged={this.onSelectionChanged}
        />
      </Row>
    )
  }

  private onSelectionChanged = (selection: StashAction) => {
    this.setState({ selectedStashAction: selection })
  }

  private onSubmit = async () => {
    const {
      repository,
      currentBranch,
      branchToCheckout,
      dispathcer,
    } = this.props

    const whereToStash =
      this.state.selectedStashAction === StashAction.KeepOnCurrentBranch
        ? currentBranch
        : branchToCheckout
    await dispathcer.createStash(repository, whereToStash)
    await dispathcer.checkoutBranch(repository, branchToCheckout, true)
    this.props.onDismissed()
  }
}
