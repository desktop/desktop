import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../../dialog'
import { Dispatcher } from '../../dispatcher'
import { Repository } from '../../../models/repository'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../../models/status'
import {
  isConflictedFile,
  getResolvedFiles,
  getConflictedFiles,
  getUnmergedFiles,
} from '../../../lib/status'
import {
  renderUnmergedFile,
  renderUnmergedFilesSummary,
  renderShellLink,
  renderAllResolved,
} from '../../lib/conflicts'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import { OkCancelButtonGroup } from '../../dialog/ok-cancel-button-group'
import { DialogSuccess } from '../../dialog/success'

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
  readonly isFileResolutionOptionsMenuOpen: boolean
  readonly countResolved: number | null
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
      isFileResolutionOptionsMenuOpen: false,
      countResolved: null,
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

  public componentDidUpdate(): void {
    const { workingDirectory, manualResolutions } = this.props

    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (resolvedConflicts.length !== (this.state.countResolved ?? 0)) {
      this.setState({ countResolved: resolvedConflicts.length })
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

  private setIsFileResolutionOptionsMenuOpen = (
    isFileResolutionOptionsMenuOpen: boolean
  ) => {
    this.setState({ isFileResolutionOptionsMenuOpen })
  }

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
                isFileResolutionOptionsMenuOpen:
                  this.state.isFileResolutionOptionsMenuOpen,
                setIsFileResolutionOptionsMenuOpen:
                  this.setIsFileResolutionOptionsMenuOpen,
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

  /**
   * Renders the banner based on count of resolved files.
   *
   * If the count of resolved files is null, then the banner is
   * not rendered as no conflicts have been resolved, yet. If the count of resolved
   * files is 0, then there have been conflicts resolved, but they have been
   * undone, we show an undone banner.
   */
  public renderBanner(conflictedFilesCount: number) {
    const { countResolved } = this.state
    if (countResolved === null) {
      return
    }

    if (countResolved === 0) {
      return <DialogSuccess>All resolutions have been undone.</DialogSuccess>
    }

    if (conflictedFilesCount === 0) {
      return (
        <DialogSuccess>All conflicted files have been resolved. </DialogSuccess>
      )
    }

    const conflictPluralized = countResolved === 1 ? 'file has' : 'files have'
    return (
      <DialogSuccess>
        {countResolved} conflicted {conflictPluralized} been resolved.
      </DialogSuccess>
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
        dismissDisabled={this.state.isCommitting}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        title={headerTitle}
        loading={this.state.isCommitting}
        disabled={this.state.isCommitting}
      >
        {this.renderBanner(conflictedFiles.length)}
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
