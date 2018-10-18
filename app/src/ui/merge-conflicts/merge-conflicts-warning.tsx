import * as React from 'react'
import { join } from 'path'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { RepositorySectionTab, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
} from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { Branch } from '../../models/branch'

interface IMergeConflictsWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly status: WorkingDirectoryStatus
  readonly onDismissed: () => void
  readonly openFileInExternalEditor: (path: string) => void
  readonly openRepositoryInShell: (repository: Repository) => void
  readonly currentBranch: Branch
  readonly comparisonBranch: Branch
}

const submitButtonString = __DARWIN__ ? 'Commit Merge' : 'Commit merge'

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
   *  dismisses the modal and shows the abort merge warning modal
   */
  private onCancel = () => {
    this.props.onDismissed()
    this.props.dispatcher.showPopup({
      type: PopupType.AbortMerge,
      repository: this.props.repository,
    })
  }

  private titleString(currentBranchName: string, comparisonBranchName: string) {
    return __DARWIN__
      ? `Resolve Conflicts Before Merging ${comparisonBranchName} into ${currentBranchName}`
      : `Resolve conflicts before merging ${comparisonBranchName} into ${currentBranchName}`
  }

  private renderShellLink(openThisRepositoryInShell: () => void): JSX.Element {
    return (
      <div className="cli-link">
        You can also{' '}
        <a onClick={openThisRepositoryInShell}>open the command line</a> to
        resolve
      </div>
    )
  }

  private renderResolvedFile(path: string): JSX.Element {
    return (
      <li className="unmerged-file-status-resolved">
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        <div className="column-left">
          <div className="file-path">{path}</div>
          <div className="file-conflicts-status">No conflicts remaining</div>
        </div>
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
      </li>
    )
  }

  private renderConflictedFile(
    path: string,
    conflicts: number,
    onOpenEditorClick: () => void
  ): JSX.Element {
    const humanReadableConflicts = Math.ceil(conflicts / 3)
    const message =
      humanReadableConflicts === 1
        ? `1 conflict`
        : `${humanReadableConflicts} conflicts`
    return (
      <li className="unmerged-file-status-conflicts">
        <Octicon symbol={OcticonSymbol.fileCode} />
        <div className="column-left">
          <div className="file-path">{path}</div>
          <div className="file-conflicts-status">{message}</div>
        </div>
        <Button onClick={onOpenEditorClick}>{openEditorString}</Button>
      </li>
    )
  }

  private renderUnmergedFile(
    file: WorkingDirectoryFileChange,
    repositoryPath: string
  ): JSX.Element | null {
    switch (file.status) {
      case AppFileStatus.Resolved:
        return this.renderResolvedFile(file.path)
      case AppFileStatus.Conflicted:
        return this.renderConflictedFile(file.path, file.conflictMarkers, () =>
          this.props.openFileInExternalEditor(join(repositoryPath, file.path))
        )
      default:
        return null
    }
  }

  private renderUnmergedFiles(
    files: Array<WorkingDirectoryFileChange>,
    repositoryPath: string
  ) {
    return (
      <ul className="unmerged-file-statuses">
        {files.map(f => this.renderUnmergedFile(f, repositoryPath))}
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
    const titleString = this.titleString(
      this.props.currentBranch.name,
      this.props.comparisonBranch.name
    )
    const unmergedFiles = this.getUnmergedFiles()
    const openThisRepositoryInShell = () =>
      this.props.openRepositoryInShell(this.props.repository)
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
          {this.renderUnmergedFiles(unmergedFiles, this.props.repository.path)}
          {this.renderShellLink(openThisRepositoryInShell)}
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={unmergedFiles.length > 0}>
              {submitButtonString}
            </Button>
            <Button onClick={this.onCancel}>{cancelButtonString}</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
