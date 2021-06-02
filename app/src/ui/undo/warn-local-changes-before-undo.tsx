import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Commit } from '../../models/commit'

interface IWarnLocalChangesBeforeUndoProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly onDismissed: () => void
}

interface IWarnLocalChangesBeforeUndoState {
  readonly isLoading: boolean
}

/**
 * Dialog that alerts user that there are uncommitted changes in the working
 * directory where they are gonna be undoing a commit.
 */
export class WarnLocalChangesBeforeUndo extends React.Component<
  IWarnLocalChangesBeforeUndoProps,
  IWarnLocalChangesBeforeUndoState
> {
  public constructor(props: IWarnLocalChangesBeforeUndoProps) {
    super(props)
    this.state = { isLoading: false }
  }

  public render() {
    const title = __DARWIN__ ? 'Undo Commit' : 'Undo commit'

    return (
      <Dialog
        id="warn-local-changes-before-undo"
        type="warning"
        title={title}
        loading={this.state.isLoading}
        disabled={this.state.isLoading}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            You have changes on this branch. Undoing the commit might lose some
            of these changes. Do you want to continue anyway?
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Continue" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, commit, onDismissed } = this.props
    this.setState({ isLoading: true })

    try {
      await dispatcher.undoCommit(repository, commit, false)
    } finally {
      this.setState({ isLoading: false })
    }

    onDismissed()
  }
}
