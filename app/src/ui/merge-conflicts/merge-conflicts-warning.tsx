import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { RepositorySectionTab } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'

interface IMergeConflictsWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly status: WorkingDirectoryStatus
  readonly onDismissed: () => void
}

/**
 * Modal to tell the user their merge encountered conflicts
 */
export class MergeConflictsWarning extends React.Component<
  IMergeConflictsWarningProps,
  {}
> {
  /**
   *  displays the repository changes tab and dismisses the modal
   */
  private onSubmit = () => {
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Changes
    )
    this.props.onDismissed()
  }
  /**
   *  aborts the merge and dismisses the modal
   */
  private onCancel = () => {
    // abort current merge here — see https://github.com/desktop/desktop/pull/5729
    this.props.onDismissed()
  }

  private renderConflictedFile(
    fileStatus: WorkingDirectoryFileChange
  ): JSX.Element {
    return <li>{fileStatus.path}</li>
  }

  public render() {
    return (
      <Dialog
        id="merge-conflicts-warning"
        // TODO: replace with helper function from @Daniel-McCarthy — see https://github.com/desktop/desktop/pull/5744
        title={
          __DARWIN__
            ? 'Resolve Conflicts Before Merging'
            : 'Resolve conflicts before merging'
        }
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <ul>{this.props.status.files.map(this.renderConflictedFile)}</ul>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">
              {/* TODO: replace with helper function from @Daniel-McCarthy — see
              https://github.com/desktop/desktop/pull/5744 */}
              {__DARWIN__ ? 'Continue To Commit' : 'Continue to commit'}
            </Button>
            <Button onClick={this.onCancel}>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
