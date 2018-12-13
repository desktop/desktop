/** tslint:disable:button-group-order */

import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { ICommitContext } from '../../models/commit'

interface ICommitConflictsWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
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
    this.props.dispatcher.setMergeConflictsBannerState(null)
    this.props.dispatcher.setCommitMessage(this.props.repository, {
      summary: '',
      description: '',
    })
  }

  public render() {
    return (
      <Dialog
        id="commit-conflict-markers-warning"
        dismissable={false}
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
        title={'Confirm commit files with conflict markers'}
        type={'warning'}
      >
        <DialogContent>
          <p>
            If you choose to commit, you'll be committing conflict markers into
            your repository.
          </p>
          <p>Are you sure you want to commit conflict markers?</p>
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
