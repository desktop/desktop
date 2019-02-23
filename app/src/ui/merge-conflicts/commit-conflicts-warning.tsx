/* eslint-disable button-group-order */

import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { ICommitContext } from '../../models/commit'
import { WorkingDirectoryFileChange } from '../../models/status'
import { PathText } from '../lib/path-text'
import { Monospaced } from '../lib/monospaced'
import { DefaultCommitMessage } from '../../models/commit-message'

interface ICommitConflictsWarningProps {
  readonly dispatcher: Dispatcher
  /** files that were selected for committing that are also conflicted */
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  /** repository user is committing in */
  readonly repository: Repository
  /** information for completing the commit */
  readonly context: ICommitContext
  readonly onDismissed: () => void
}

/**
 * Modal to tell the user their merge encountered conflicts
 */
export class CommitConflictsWarning extends React.Component<
  ICommitConflictsWarningProps,
  {}
> {
  private onCancel = () => {
    this.props.onDismissed()
  }

  private onSubmit = async () => {
    this.props.onDismissed()
    await this.props.dispatcher.commitIncludedChanges(
      this.props.repository,
      this.props.context
    )
    this.props.dispatcher.clearBanner()
    this.props.dispatcher.setCommitMessage(
      this.props.repository,
      DefaultCommitMessage
    )
  }

  private renderFiles(files: ReadonlyArray<WorkingDirectoryFileChange>) {
    return (
      <p>
        {files.map(f => (
          <Monospaced key={f.path}>
            <PathText path={f.path} />
          </Monospaced>
        ))}
      </p>
    )
  }

  public render() {
    return (
      <Dialog
        id="commit-conflict-markers-warning"
        dismissable={false}
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
        title={'Confirm committing conflicted files'}
        type={'warning'}
      >
        <DialogContent>
          <p>
            If you choose to commit, you’ll be committing the following
            conflicted files into your repository:
          </p>
          {this.renderFiles(this.props.files)}
          <p>Are you sure you want to commit these conflicted files?</p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button onClick={this.onCancel}>Cancel</Button>
            <Button type="submit">Yes, commit files</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
