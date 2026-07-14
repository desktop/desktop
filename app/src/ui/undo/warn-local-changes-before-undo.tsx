import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Commit } from '../../models/commit'

interface IWarnLocalChangesBeforeUndoProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly isWorkingDirectoryClean: boolean
  readonly confirmUndoCommit: boolean
  readonly onDismissed: () => void
}

interface IWarnLocalChangesBeforeUndoState {
  readonly isLoading: boolean
  readonly confirmUndoCommit: boolean
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
    this.state = {
      isLoading: false,
      confirmUndoCommit: props.confirmUndoCommit,
    }
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
        role="alertdialog"
        ariaDescribedBy="undo-warning-message"
      >
        {this.getWarningDialog()}
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Continue" />
        </DialogFooter>
      </Dialog>
    )
  }

  private getWarningDialog() {
    if (this.props.commit.isMergeCommit) {
      return this.getMergeCommitWarningDialog()
    }
    return (
      <DialogContent>
        <Row id="undo-warning-message">
          You have changes in progress. Undoing the commit might result in some
          of these changes being lost. Do you want to continue anyway?
        </Row>
        <Row>
          <Checkbox
            label="Do not show this message again"
            value={
              this.state.confirmUndoCommit
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onConfirmUndoCommitChanged}
          />
        </Row>
      </DialogContent>
    )
  }

  private getMergeCommitWarningDialog() {
    if (this.props.isWorkingDirectoryClean) {
      return (
        <DialogContent>
          <p>{this.getMergeCommitUndoWarningText()}</p>
          <p>Do you want to continue anyway?</p>
        </DialogContent>
      )
    }
    return (
      <DialogContent>
        <p>
          You have changes in progress. Undoing the merge commit might result in
          some of these changes being lost.
        </p>
        <p>{this.getMergeCommitUndoWarningText()}</p>
        <p>Do you want to continue anyway?</p>
      </DialogContent>
    )
  }

  private getMergeCommitUndoWarningText() {
    return `Undoing a merge commit will apply the changes from the merge into
    your working directory, and committing again will create an entirely new
    commit. This means you will lose the merge commit and, as a result, commits
    from the merged branch could disappear from this branch.`
  }

  private onSubmit = async () => {
    const { dispatcher, repository, commit, onDismissed } = this.props
    this.setState({ isLoading: true })

    try {
      dispatcher.setConfirmUndoCommitSetting(this.state.confirmUndoCommit)
      await dispatcher.undoCommit(repository, commit, false)
    } finally {
      this.setState({ isLoading: false })
    }

    onDismissed()
  }

  private onConfirmUndoCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmUndoCommit: value })
  }
}
