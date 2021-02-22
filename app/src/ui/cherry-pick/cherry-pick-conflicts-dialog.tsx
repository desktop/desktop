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
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'

interface ICherryPickConflictsDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  readonly step: ShowConflictsStep

  readonly userHasResolvedConflicts: boolean
  readonly workingDirectory: WorkingDirectoryStatus

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
    const { workingDirectory, userHasResolvedConflicts } = this.props

    // skip this work once we know conflicts have been resolved
    if (userHasResolvedConflicts) {
      return
    }

    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      new Map<string, ManualConflictResolution>()
    )

    if (resolvedConflicts.length > 0) {
      this.props.dispatcher.setConflictsResolved(this.props.repository)
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
    const { workingDirectory } = this.props

    const unmergedFiles = getUnmergedFiles(workingDirectory)
    const conflictedFilesCount = getConflictedFiles(
      workingDirectory,
      new Map<string, ManualConflictResolution>()
    ).length

    const tooltipString =
      conflictedFilesCount > 0
        ? 'Resolve all conflicts before continuing'
        : undefined

    return (
      <Dialog
        id="cherry-pick-conflicts-list"
        onDismissed={this.onDismissed}
        title="Resolve conflicts before cherry picking"
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          {this.renderContent(unmergedFiles, conflictedFilesCount)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              __DARWIN__ ? 'Continue Cherry Pick' : 'Continue cherry pick'
            }
            okButtonDisabled={conflictedFilesCount > 0}
            okButtonTitle={tooltipString}
            cancelButtonText={
              __DARWIN__ ? 'Abort Cherry Pick' : 'Abort cherry pick'
            }
            cancelButtonDisabled={this.state.isAborting}
            onCancelButtonClick={this.onCancel}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
