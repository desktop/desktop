import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from './dialog'
import { Repository } from '../models/repository'
import { Dispatcher } from './dispatcher'
import { Row } from './lib/row'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'
import { Commit } from '../models/commit'
import { TextBox } from './lib/text-box'
import { TextArea } from './lib/text-area'

interface IAmendCommitProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly onDismissed: () => void
}

interface IAmendCommitState {
  readonly isLoading: boolean
  readonly summary: string
  readonly body: string
}

/**
 * Dialog that alerts user that their stash will be overwritten
 */
export class AmendCommit extends React.Component<
  IAmendCommitProps,
  IAmendCommitState
> {
  public constructor(props: IAmendCommitProps) {
    super(props)
    this.state = {
      isLoading: false,
      summary: props.commit.summary,
      body: props.commit.body,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Amend Commit' : 'Amend commit'

    return (
      <Dialog
        id="overwrite-stash"
        type="warning"
        title={title}
        loading={this.state.isLoading}
        disabled={this.state.isLoading}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            Are you sure you want to proceed? This will change your most recent
            commit.
          </Row>
          <Row>
            <TextBox
              label="Summary"
              value={this.state.summary}
              onValueChanged={this.onSummaryChanged}
            />
          </Row>
          <Row>
            <TextArea
              label="Description"
              value={this.state.body}
              onValueChanged={this.onBodyChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Amend" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSummaryChanged = (summary: string) => {
    this.setState({
      summary,
    })
  }

  private onBodyChanged = (body: string) => {
    this.setState({
      body,
    })
  }

  private onSubmit = async () => {
    // const { dispatcher, repository, branchToCheckout, onDismissed } = this.props
    // this.setState({ isLoading: true })

    // try {
    //   if (branchToCheckout !== null) {
    //     const strategy = UncommittedChangesStrategy.StashOnCurrentBranch
    //     await dispatcher.checkoutBranch(repository, branchToCheckout, strategy)
    //   } else {
    //     await dispatcher.createStashForCurrentBranch(repository, false)
    //   }
    // } finally {
    //   this.setState({ isLoading: false })
    // }

    this.props.onDismissed()
  }
}
