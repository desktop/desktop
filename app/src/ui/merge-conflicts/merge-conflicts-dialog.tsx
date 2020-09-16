import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import { RepositorySectionTab } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import {
  isConflictedFile,
  getResolvedFiles,
  getConflictedFiles,
  getUnmergedFiles,
} from '../../lib/status'
import { DefaultCommitMessage } from '../../models/commit-message'
import {
  renderUnmergedFile,
  renderUnmergedFilesSummary,
  renderShellLink,
  renderAllResolved,
} from '../lib/conflicts'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { BannerType } from '../../models/banner'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

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
  readonly manualResolutions: Map<string, ManualConflictResolution>
}

interface IMergeConflictsDialogState {
  readonly isCommitting: boolean
}

/**
 * Modal to tell the user their merge encountered conflicts
 */
export class MergeConflictsDialog extends React.Component<
  IMergeConflictsDialogProps,
  IMergeConflictsDialogState
> {
  public constructor(props: IMergeConflictsDialogProps) {
    super(props)
    this.state = {
      isCommitting: false,
    }
  }

  /**
   *  commits the merge displays the repository changes tab and dismisses the modal
   */
  private onSubmit = async () => {
    this.setState({ isCommitting: true })
    await this.props.dispatcher.finishConflictedMerge(
      this.props.repository,
      this.props.workingDirectory,
      {
        type: BannerType.SuccessfulMerge,
        ourBranch: this.props.ourBranch,
        theirBranch: this.props.theirBranch,
      }
    )
    await this.props.dispatcher.setCommitMessage(
      this.props.repository,
      DefaultCommitMessage
    )
    await this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Changes
    )
    this.props.onDismissed()
    this.props.dispatcher.recordGuidedConflictedMergeCompletion()
  }

  /**
   *  dismisses the modal and shows the abort merge warning modal
   */
  private onCancel = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()

    const anyResolvedFiles =
      getResolvedFiles(
        this.props.workingDirectory,
        this.props.manualResolutions
      ).length > 0
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
    this.props.dispatcher.setBanner({
      type: BannerType.MergeConflictsFound,
      ourBranch: this.props.ourBranch,
      popup: {
        type: PopupType.MergeConflicts,
        ourBranch: this.props.ourBranch,
        theirBranch: this.props.theirBranch,
        repository: this.props.repository,
      },
    })
    this.props.dispatcher.recordMergeConflictsDialogDismissal()
    const anyConflictedFiles =
      getConflictedFiles(
        this.props.workingDirectory,
        this.props.manualResolutions
      ).length > 0
    if (anyConflictedFiles) {
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
                manualResolution: this.props.manualResolutions.get(f.path),
                ourBranch: this.props.ourBranch,
                theirBranch: this.props.theirBranch,
              })
            : null
        )}
      </ul>
    )
  }

  private renderContent(
    unmergedFiles: ReadonlyArray<WorkingDirectoryFileChange>,
    conflictedFilesCount: number
  ): JSX.Element {
    if (unmergedFiles.length === 0) {
      return renderAllResolved()
    }

    return (
      <>
        {renderUnmergedFilesSummary(conflictedFilesCount)}
        {this.renderUnmergedFiles(unmergedFiles)}
        {renderShellLink(this.openThisRepositoryInShell)}
      </>
    )
  }

  public render() {
    const unmergedFiles = getUnmergedFiles(this.props.workingDirectory)
    const conflictedFilesCount = getConflictedFiles(
      this.props.workingDirectory,
      this.props.manualResolutions
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
        dismissable={!this.state.isCommitting}
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        title={headerTitle}
        loading={this.state.isCommitting}
        disabled={this.state.isCommitting}
      >
        <DialogContent>
          {this.renderContent(unmergedFiles, conflictedFilesCount)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Commit Merge' : 'Commit merge'}
            okButtonDisabled={conflictedFilesCount > 0}
            okButtonTitle={tooltipString}
            cancelButtonText={__DARWIN__ ? 'Abort Merge' : 'Abort merge'}
            onCancelButtonClick={this.onCancel}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
