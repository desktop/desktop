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
import { Octicon, OcticonSymbol } from '../octicons'
import { abortMerge } from '../../lib/git'

interface IMergeConflictsWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly status: WorkingDirectoryStatus
  readonly onDismissed: () => void
}

const titleString = __DARWIN__
  ? 'Resolve Conflicts Before Merging'
  : 'Resolve conflicts before merging'

const submitButtonString = __DARWIN__
  ? 'Continue to Commit'
  : 'Continue to commit'

const openEditorString = __DARWIN__ ? 'Open in Editor' : 'Open in editor'
const cancelButtonString = __DARWIN__ ? 'Abort Merge' : 'Abort merge'

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
  private onCancel = async () => {
    await abortMerge(this.props.repository)
    this.props.onDismissed()
  }

  private renderCliLink(): JSX.Element {
    return (
      <div className="cli-link">
        You can also <a>open the command line</a> to resolve
      </div>
    )
  }

  private renderFileWithoutConflicts(path: string): JSX.Element {
    return (
      <li className="unmerged-file-status-resolved">
        <Octicon symbol={OcticonSymbol.fileCode} />
        <div className="column-left">
          <div className="file-path">{path}</div>
          <div className="file-conflicts-status">No conflicts remaining</div>
        </div>
        <Octicon symbol={OcticonSymbol.check} />
      </li>
    )
  }

  private renderFileWithConflicts(
    path: string,
    conflicts: number
  ): JSX.Element {
    const message = conflicts === 1 ? `1 conflict` : `${conflicts} conflicts`
    return (
      <li className="unmerged-file-status-conflicts">
        <Octicon symbol={OcticonSymbol.fileCode} />
        <div className="column-left">
          <div className="file-path">{path}</div>
          <div className="file-conflicts-status">{message}</div>
        </div>
        <button className="button-component">{openEditorString}</button>
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
        return this.renderFileWithConflicts(file.path, file.conflictMarkers)
      default:
        return null
    }
  }

  private renderUnmergedFiles(files: Array<WorkingDirectoryFileChange>) {
    return (
      <ul className="unmerged-file-statuses">
        {files.map(f => this.renderUnmergedFile(f))}
      </ul>
    )
  }

  private getUnmergedFiles() {
    return this.props.status.files.filter(
      file =>
        file.status === AppFileStatus.Conflicted ||
        file.status === AppFileStatus.Resolved
    )
  }

  private renderUnmergedFilesSummary(unmergedFiles: number) {
    // localization, it burns :vampire:
    const message =
      unmergedFiles === 1
        ? `1 conflicted file`
        : `${unmergedFiles} conflicted files`
    return <h3 className="summary">{message}</h3>
  }

  public render() {
    const unmergedFiles = this.getUnmergedFiles()
    return (
      <Dialog
        id="merge-conflicts-list"
        title={titleString}
        dismissable={false}
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          {this.renderUnmergedFilesSummary(unmergedFiles.length)}
          {this.renderUnmergedFiles(unmergedFiles)}
          {this.renderCliLink()}
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">{submitButtonString}</Button>
            <Button onClick={this.onCancel}>{cancelButtonString}</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
