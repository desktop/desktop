import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Commit } from '../../models/commit'

interface IStashBeforeUndoProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly overwrite: boolean
  readonly onDismissed: () => void
}

interface IStashBeforeUndoState {
  readonly isLoading: boolean
}

/**
 * Dialog that alerts user that there are uncommitted changes in the working
 * directory where they are gonna be undoing a commit.
 */
export class StashBeforeUndo extends React.Component<
  IStashBeforeUndoProps,
  IStashBeforeUndoState
> {
  public constructor(props: IStashBeforeUndoProps) {
    super(props)
    this.state = { isLoading: false }
  }

  public render() {
    const title = __DARWIN__ ? 'Undo Commit' : 'Undo commit'
    const okButtonTitle = this.props.overwrite
      ? __DARWIN__
        ? 'Overwrite and Undo'
        : 'Overwrite and undo'
      : __DARWIN__
      ? 'Stash and Undo'
      : 'Stash and undo'

    return (
      <Dialog
        id="stash-before-undo"
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
            of these changes. Do you want to stash your changes and undo the
            commit?
          </Row>
          {this.props.overwrite && (
            <Row>
              You also have stashed changes on this branch. If you continue,
              your current stash will be overwritten by creating a new stash
            </Row>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={okButtonTitle}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, commit, onDismissed } = this.props
    this.setState({ isLoading: true })

    try {
      await dispatcher.stashAndUndoCommit(repository, commit)
    } finally {
      this.setState({ isLoading: false })
    }

    onDismissed()
  }
}
