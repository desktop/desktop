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
  AppFileStatus,
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

  private renderFileWithoutConflicts(path: string): JSX.Element {
    return (
      <li>
        {/* <icon /> */}
        <div>
          <div>{path}</div>
          <div>No conflicts remaining</div>
        </div>
        {/* <icon /> */}
      </li>
    )
  }

  private renderFileWithConflicts(
    path: string,
    conflicts: number
  ): JSX.Element {
    const message = conflicts === 1 ? `1 conflict` : `${conflicts} conflicts`
    return (
      <li>
        {/* <icon /> */}
        <div>
          <div>{path}</div>
          <div>{message}</div>
        </div>
        <button>Open in editor</button>
      </li>
    )
  }

  private renderUnmergedFile(
    file: WorkingDirectoryFileChange
  ): JSX.Element | null {
    switch (file.status) {
      case AppFileStatus.Resolved:
        return this.renderFileWithoutConflicts(file.path)
      case AppFileStatus.Conflicted:
        // TODO: use count implemented in https://github.com/desktop/desktop/pull/5808
        return this.renderFileWithConflicts(file.path, 1)
      default:
        return null
    }
  }

  private renderUnmergedFiles(files: Array<WorkingDirectoryFileChange>) {
    return <ul>{files.map(this.renderUnmergedFile)}</ul>
  }

  private getUnmergedFiles() {
    return this.props.status.files.filter(
      file =>
        file.status === AppFileStatus.Conflicted ||
        file.status === AppFileStatus.Resolved
    )
  }

  private renderUnmergedFilesSummary(files: Array<WorkingDirectoryFileChange>) {
    // localization, it burns :vampire:
    const message =
      files.length === 1
        ? `1 conflicted file`
        : `${files.length} conflicted files`
    return <h3>{message}</h3>
  }

  public render() {
    const unmergedFiles = this.getUnmergedFiles()
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
          {this.renderUnmergedFilesSummary(unmergedFiles)}
          {this.renderUnmergedFiles(unmergedFiles)}
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
