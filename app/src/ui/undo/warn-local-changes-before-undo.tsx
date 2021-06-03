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
  readonly isWorkingDirectoryClean: boolean
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
          <Row>{this.getWarningText()}</Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Continue" />
        </DialogFooter>
      </Dialog>
    )
  }

  private getWarningText() {
    if (
      this.props.commit.isMergeCommit &&
      !this.props.isWorkingDirectoryClean
    ) {
      return (
        <>
          You have changes in progress. Undoing the merge commit might result in
          some of these changes being lost.
          <br />
          <br />
          Also, undoing a merge commit will apply the changes from the merge
          into your working directory, and committing again will create an
          entirely new commit. This means you will lose the merge commit and, as
          a result, commits from the merged branch could disappear from this
          branch.
          <br />
          <br />
          Do you want to continue anyway?
        </>
      )
    } else if (this.props.commit.isMergeCommit) {
      return (
        <>
          Undoing a merge commit will apply the changes from the merge into your
          working directory, and committing again will create an entirely new
          commit. This means you will lose the merge commit and, as a result,
          commits from the merged branch could disappear from this branch.
          <br />
          <br />
          Do you want to continue anyway?
        </>
      )
    } else {
      return (
        <>
          You have changes in progress. Undoing the commit might result in some
          of these changes being lost. Do you want to continue anyway?
        </>
      )
    }
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
