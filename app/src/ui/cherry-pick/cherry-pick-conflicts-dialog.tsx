import * as React from 'react'

import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { Repository } from '../../models/repository'

import {
  getUnmergedFiles,
  getConflictedFiles,
  isConflictedFile,
  getResolvedFiles,
} from '../../lib/status'
import {
  renderUnmergedFilesSummary,
  renderShellLink,
  renderAllResolved,
} from '../lib/conflicts/render-functions'
import { renderUnmergedFile } from '../lib/conflicts/unmerged-file'

import {
  DialogContent,
  Dialog,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { Dispatcher } from '../dispatcher'
import { ShowConflictsStep } from '../../models/cherry-pick'

interface ICherryPickConflictsDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  readonly step: ShowConflictsStep

  readonly userHasResolvedConflicts: boolean
  readonly workingDirectory: WorkingDirectoryStatus

  // For display in manual resolution context menu
  readonly sourceBranchName: string | null

  readonly onDismissed: () => void
  readonly onContinueCherryPick: (step: ShowConflictsStep) => void
  readonly onAbortCherryPick: (step: ShowConflictsStep) => void
  readonly showCherryPickConflictsBanner: (step: ShowConflictsStep) => void

  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

interface ICherryPickConflictsDialogState {
  readonly isAborting: boolean
}

export class CherryPickConflictsDialog extends React.Component<
  ICherryPickConflictsDialogProps,
  ICherryPickConflictsDialogState
> {
  public constructor(props: ICherryPickConflictsDialogProps) {
    super(props)

    this.state = {
      isAborting: false,
    }
  }

  public componentWillUnmount() {
    const {
      workingDirectory,
      step,
      userHasResolvedConflicts,
      dispatcher,
      repository,
    } = this.props

    // skip this work once we know conflicts have been resolved
    if (userHasResolvedConflicts) {
      return
    }

    const { conflictState } = step
    const { manualResolutions } = conflictState

    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (resolvedConflicts.length > 0) {
      dispatcher.setCherryPickConflictsResolved(repository)
    }
  }

  private onCancel = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.setState({ isAborting: true })

    this.props.onAbortCherryPick(this.props.step)

    this.setState({ isAborting: false })
  }

  private onDismissed = () => {
    this.props.onDismissed()
    this.props.showCherryPickConflictsBanner(this.props.step)
  }

  private onSubmit = async () => {
    this.props.onContinueCherryPick(this.props.step)
  }

  private openThisRepositoryInShell = () =>
    this.props.openRepositoryInShell(this.props.repository)

  private renderUnmergedFiles(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    const {
      resolvedExternalEditor,
      openFileInExternalEditor,
      repository,
      dispatcher,
      step,
      sourceBranchName,
    } = this.props

    const {
      manualResolutions,
      targetBranchName: ourBranch,
    } = step.conflictState

    return (
      <ul className="unmerged-file-statuses">
        {files.map(f =>
          isConflictedFile(f.status)
            ? renderUnmergedFile({
                path: f.path,
                status: f.status,
                resolvedExternalEditor,
                openFileInExternalEditor,
                repository,
                dispatcher,
                manualResolution: manualResolutions.get(f.path),
                theirBranch:
                  sourceBranchName !== null ? sourceBranchName : undefined,
                ourBranch,
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
    const { workingDirectory, step } = this.props
    const { manualResolutions } = step.conflictState

    const unmergedFiles = getUnmergedFiles(workingDirectory)
    const conflictedFilesCount = getConflictedFiles(
      workingDirectory,
      manualResolutions
    ).length

    const tooltipString =
      conflictedFilesCount > 0
        ? 'Resolve all conflicts before continuing'
        : undefined

    const ok = __DARWIN__ ? 'Continue Cherry-pick' : 'Continue cherry-pick'
    const cancel = __DARWIN__ ? 'Abort Cherry-pick' : 'Abort cherry-pick'

    return (
      <Dialog
        id="cherry-pick-conflicts-list"
        onDismissed={this.onDismissed}
        title="Resolve conflicts before cherry-picking"
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          {this.renderContent(unmergedFiles, conflictedFilesCount)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={ok}
            okButtonDisabled={conflictedFilesCount > 0}
            okButtonTitle={tooltipString}
            cancelButtonText={cancel}
            cancelButtonDisabled={this.state.isAborting}
            onCancelButtonClick={this.onCancel}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
