import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
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
import {
  renderUnmergedFile,
  renderUnmergedFilesSummary,
  renderShellLink,
  renderAllResolved,
} from '../lib/conflicts'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IConflictsDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly userHasResolvedConflicts?: boolean
  readonly resolvedExternalEditor: string | null
  /* Depending on the operation, we may only know one our or their branch */
  readonly ourBranch?: string
  readonly theirBranch?: string
  readonly manualResolutions: Map<string, ManualConflictResolution>
  readonly headerTitle: string | JSX.Element
  readonly submitButton: string
  readonly abortButton: string
  readonly onSubmit: () => Promise<void>
  readonly onAbort: () => Promise<void>
  readonly onDismissed: () => void
  readonly openFileInExternalEditor: (path: string) => void
  readonly openRepositoryInShell: (repository: Repository) => void
  readonly someConflictsHaveBeenResolved?: () => void
}

interface IConflictsDialogState {
  readonly isCommitting: boolean
  readonly isAborting: boolean
}

/**
 * Modal to tell the user their encountered conflicts
 * - To be used generically with conflicts encountered by numerous operations
 *   such as merging, rebasing, cherry-picking, squashing, reordering, etc.
 */
export class ConflictsDialog extends React.Component<
  IConflictsDialogProps,
  IConflictsDialogState
> {
  public constructor(props: IConflictsDialogProps) {
    super(props)
    this.state = {
      isCommitting: false,
      isAborting: false,
    }
  }

  /**
   *  Provides us ability to track if user has resolved at least one conflict in
   *  this operation
   */
  public componentWillUnmount() {
    const {
      workingDirectory,
      userHasResolvedConflicts,
      manualResolutions,
      someConflictsHaveBeenResolved,
    } = this.props

    // skip this work once we know conflicts have been resolved
    if (
      userHasResolvedConflicts ||
      someConflictsHaveBeenResolved === undefined
    ) {
      return
    }

    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (resolvedConflicts.length > 0) {
      someConflictsHaveBeenResolved()
    }
  }

  /**
   *  Invokes submit callback and dismisses modal
   */
  private onSubmit = async () => {
    this.setState({ isCommitting: true })
    await this.props.onSubmit()
  }

  /**
   *  Invokes abort callback and dismisses modal
   */
  private onAbort = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()

    this.setState({ isAborting: true })
    await this.props.onAbort()
    this.setState({ isAborting: false })
  }

  private openThisRepositoryInShell = () =>
    this.props.openRepositoryInShell(this.props.repository)

  /**
   *  Renders the list of conflicts in the dialog
   */
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
    const {
      workingDirectory,
      manualResolutions,
      headerTitle,
      submitButton,
      abortButton,
    } = this.props

    const unmergedFiles = getUnmergedFiles(this.props.workingDirectory)
    const conflictedFiles = getConflictedFiles(
      workingDirectory,
      manualResolutions
    )

    const tooltipString =
      conflictedFiles.length > 0
        ? 'Resolve all changes before continuing'
        : undefined

    return (
      <Dialog
        id="conflicts-dialog"
        dismissable={!this.state.isCommitting}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        title={headerTitle}
        loading={this.state.isCommitting}
        disabled={this.state.isCommitting}
      >
        <DialogContent>
          {this.renderContent(unmergedFiles, conflictedFiles.length)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={submitButton}
            okButtonDisabled={conflictedFiles.length > 0}
            okButtonTitle={tooltipString}
            cancelButtonText={abortButton}
            onCancelButtonClick={this.onAbort}
            cancelButtonDisabled={this.state.isAborting}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
