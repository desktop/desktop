import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import { RepositorySectionTab } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  isConflictedFileStatus,
} from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { DialogHeader } from '../dialog/header'
import { LinkButton } from '../lib/link-button'
import { isConflictedFile, hasUnresolvedConflicts } from '../../lib/status'
import { DefaultCommitMessage } from '../../models/commit-message'
import { renderUnmergedFile } from './unmerged-file'

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

/** Filter working directory changes for conflicted or resolved files  */
function getUnmergedFiles(status: WorkingDirectoryStatus) {
  return status.files.filter(f => isConflictedFile(f.status))
}

/** Filter working directory changes for resolved files  */
function getResolvedFiles(status: WorkingDirectoryStatus) {
  return status.files.filter(
    f => isConflictedFileStatus(f.status) && !hasUnresolvedConflicts(f.status)
  )
}

/** Filter working directory changes for conflicted files  */
function getConflictedFiles(status: WorkingDirectoryStatus) {
  return status.files.filter(
    f => isConflictedFileStatus(f.status) && hasUnresolvedConflicts(f.status)
  )
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
    await this.props.dispatcher.finishConflictedMerge(
      this.props.repository,
      this.props.workingDirectory,
      {
        ourBranch: this.props.ourBranch,
        theirBranch: this.props.theirBranch,
      }
    )
    this.props.dispatcher.setCommitMessage(
      this.props.repository,
      DefaultCommitMessage
    )
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Changes
    )
    this.props.onDismissed()
    this.props.dispatcher.recordGuidedConflictedMergeCompletion()
  }

  /**
   *  dismisses the modal and shows the abort merge warning modal
   */
  private onCancel = async () => {
    const anyResolvedFiles =
      getResolvedFiles(this.props.workingDirectory).length > 0
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

  private onDismissed = async () => {
    this.props.onDismissed()
    this.props.dispatcher.setMergeConflictsBannerState({
      ourBranch: this.props.ourBranch,
      popup: {
        type: PopupType.MergeConflicts,
        ourBranch: this.props.ourBranch,
        theirBranch: this.props.theirBranch,
        repository: this.props.repository,
      },
    })
    this.props.dispatcher.recordMergeConflictsDialogDismissal()
    if (getConflictedFiles(this.props.workingDirectory).length > 0) {
      this.props.dispatcher.recordAnyConflictsLeftOnMergeConflictsDialogDismissal()
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
      <div>
        <LinkButton onClick={openThisRepositoryInShell}>
          Open in command line,
        </LinkButton>{' '}
        your tool of choice, or close to resolve manually.
      </div>
    )
  }

  private renderUnmergedFiles(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    return (
      <ul className="unmerged-file-statuses">
        {files.map(f =>
          isConflictedFile(f.status)
            ? renderUnmergedFile({
                path: f.path,
                status: f.status,
                resolvedExternalEditor: this.props.resolvedExternalEditor,
                openFileInExternalEditor: this.props.openFileInExternalEditor,
                repository: this.props.repository,
                dispatcher: this.props.dispatcher,
              })
            : null
        )}
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

  private renderAllResolved() {
    return (
      <div className="all-conflicts-resolved">
        <div className="green-circle">
          <Octicon symbol={OcticonSymbol.check} />
        </div>
        <div className="message">All conflicts resolved</div>
      </div>
    )
  }

  private renderContent(
    unmergedFiles: ReadonlyArray<WorkingDirectoryFileChange>,
    conflictedFilesCount: number
  ): JSX.Element {
    if (unmergedFiles.length === 0) {
      return this.renderAllResolved()
    }

    return (
      <>
        {this.renderUnmergedFilesSummary(conflictedFilesCount)}
        {this.renderUnmergedFiles(unmergedFiles)}
        {this.renderShellLink(this.openThisRepositoryInShell)}
      </>
    )
  }

  public render() {
    const unmergedFiles = getUnmergedFiles(this.props.workingDirectory)
    const conflictedFilesCount = getConflictedFiles(this.props.workingDirectory)
      .length

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
        dismissable={true}
        onDismissed={this.onDismissed}
        disableClickDismissalAlways={true}
        onSubmit={this.onSubmit}
      >
        <DialogHeader
          title={headerTitle}
          dismissable={true}
          onDismissed={this.onDismissed}
        />
        <DialogContent>
          {this.renderContent(unmergedFiles, conflictedFilesCount)}
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
