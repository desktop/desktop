import * as React from 'react'
import { join } from 'path'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { PopupType } from '../../models/popup'
import { RepositorySectionTab } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
} from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { PathText } from '../lib/path-text'
import { DialogHeader } from '../dialog/header'
import { ConflictFileStatus } from '../../models/conflicts'
import { LinkButton } from '../lib/link-button'

interface IMergeConflictsDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly onDismissed: () => void
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
  readonly ourBranch: string
  /* `undefined` when we didn't know the branch at the beginning of this flow */
  readonly theirBranch?: string
}

/**
 * Calculates the number of merge conclicts in a file from the number of markers
 * divides by three and rounds up since each conflict is indicated by three separate markers
 * (`<<<<<`, `>>>>>`, and `=====`)
 * @param conflictMarkers number of conflict markers in a file
 */
function calculateConflicts(conflictMarkers: number) {
  return Math.ceil(conflictMarkers / 3)
}

/** Filter working directory changes for conflicted or resolved files  */
function getUnmergedFiles(status: WorkingDirectoryStatus) {
  return status.files.filter(
    file =>
      file.status === AppFileStatus.Conflicted ||
      file.status === AppFileStatus.Resolved
  )
}

function editorButtonString(editorName: string | null): string {
  const defaultEditorString = 'editor'
  return `Open in ${editorName || defaultEditorString}`
}

function editorButtonTooltip(editorName: string | null): string | undefined {
  if (editorName !== null) {
    // no need to render a tooltip if we have a known editor
    return
  }

  if (__DARWIN__) {
    return `No editor configured in Preferences > Advanced`
  } else {
    return `No editor configured in Options > Advanced`
  }
}

const submitButtonString = 'Commit merge'
const cancelButtonString = 'Abort merge'

/**
 * Modal to tell the user their merge encountered conflicts
 */
export class MergeConflictsDialog extends React.Component<
  IMergeConflictsDialogProps,
  {}
> {
  public async componentDidMount() {
    this.props.dispatcher.resolveCurrentEditor()
  }

  /**
   *  commits the merge displays the repository changes tab and dismisses the modal
   */
  private onSubmit = async () => {
    await this.props.dispatcher.createMergeCommit(
      this.props.repository,
      this.props.workingDirectory.files,
      {
        ourBranch: this.props.ourBranch,
        theirBranch: this.props.theirBranch,
      }
    )
    this.props.dispatcher.setCommitMessage(this.props.repository, null)
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Changes
    )
    this.props.onDismissed()
  }

  /**
   *  dismisses the modal and shows the abort merge warning modal
   */
  private onCancel = async () => {
    const anyResolvedFiles = getUnmergedFiles(this.props.workingDirectory).some(
      f => f.status === AppFileStatus.Resolved
    )
    if (!anyResolvedFiles) {
      await this.props.dispatcher.abortMerge(this.props.repository)
      this.props.onDismissed()
    } else {
      this.props.onDismissed()
      this.props.dispatcher.showPopup({
        type: PopupType.AbortMerge,
        repository: this.props.repository,
        ourBranch: this.props.ourBranch,
        theirBranch: this.props.theirBranch,
      })
    }
  }

  private renderHeaderTitle(ourBranch: string, theirBranch?: string) {
    if (theirBranch !== undefined) {
      return (
        <span>
          {`Resolve conflicts before merging `}
          <strong>{theirBranch}</strong>
          {` into `}
          <strong>{ourBranch}</strong>
        </span>
      )
    }
    return (
      <span>
        {`Resolve conflicts before merging into `}
        <strong>{ourBranch}</strong>
      </span>
    )
  }

  private openThisRepositoryInShell = () =>
    this.props.openRepositoryInShell(this.props.repository)

  private renderShellLink(openThisRepositoryInShell: () => void): JSX.Element {
    return (
      <div className="cli-link">
        You can also{' '}
        <LinkButton onClick={openThisRepositoryInShell}>
          open the command line
        </LinkButton>{' '}
        to resolve
      </div>
    )
  }

  private renderResolvedFile(path: string): JSX.Element {
    return (
      <li className="unmerged-file-status-resolved">
        <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
        <div className="column-left">
          <PathText path={path} availableWidth={200} />
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
    conflictStatus: ConflictFileStatus,
    onOpenEditorClick: () => void
  ): JSX.Element | null {
    if (conflictStatus.kind === 'text') {
      const humanReadableConflicts = calculateConflicts(
        conflictStatus.conflictMarkerCount
      )
      const message =
        humanReadableConflicts === 1
          ? `1 conflict`
          : `${humanReadableConflicts} conflicts`

      const disabled = this.props.resolvedExternalEditor === null

      const tooltip = editorButtonTooltip(this.props.resolvedExternalEditor)

      return (
        <li className="unmerged-file-status-conflicts">
          <Octicon symbol={OcticonSymbol.fileCode} className="file-octicon" />
          <div className="column-left">
            <PathText path={path} availableWidth={200} />
            <div className="file-conflicts-status">{message}</div>
          </div>
          <Button
            onClick={onOpenEditorClick}
            disabled={disabled}
            tooltip={tooltip}
          >
            {editorButtonString(this.props.resolvedExternalEditor)}
          </Button>
        </li>
      )
    }
    return null
  }

  private renderUnmergedFile(
    file: WorkingDirectoryFileChange,
    repositoryPath: string
  ): JSX.Element | null {
    switch (file.status) {
      case AppFileStatus.Resolved:
        return this.renderResolvedFile(file.path)
      case AppFileStatus.Conflicted:
        if (file.conflictStatus === null) {
          throw new Error(
            'Invalid state - a conflicted file should have conflicted status set'
          )
        }

        return this.renderConflictedFile(file.path, file.conflictStatus, () =>
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

  private renderUnmergedFilesSummary(conflictedFilesCount: number) {
    // localization, it burns :vampire:
    const message =
      conflictedFilesCount === 1
        ? `1 conflicted file`
        : `${conflictedFilesCount} conflicted files`
    return <h3 className="summary">{message}</h3>
  }

  public render() {
    const unmergedFiles = getUnmergedFiles(this.props.workingDirectory)
    const conflictedFilesCount = unmergedFiles.filter(
      f => f.status === AppFileStatus.Conflicted
    ).length
    const headerTitle = this.renderHeaderTitle(
      this.props.ourBranch,
      this.props.theirBranch
    )
    const tooltipString =
      conflictedFilesCount > 0
        ? 'Resolve all changes before merging'
        : undefined
    return (
      <Dialog
        id="merge-conflicts-list"
        dismissable={false}
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
      >
        <DialogHeader title={headerTitle} dismissable={false} />
        <DialogContent>
          {this.renderUnmergedFilesSummary(conflictedFilesCount)}
          {this.renderUnmergedFiles(unmergedFiles, this.props.repository.path)}
          {this.renderShellLink(this.openThisRepositoryInShell)}
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button
              type="submit"
              disabled={conflictedFilesCount > 0}
              tooltip={tooltipString}
            >
              {submitButtonString}
            </Button>
            <Button onClick={this.onCancel}>{cancelButtonString}</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
