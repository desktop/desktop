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
import { ShowConflictsStep } from '../../models/rebase-flow-step'

interface IShowConflictedFilesDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  readonly step: ShowConflictsStep

  readonly userHasResolvedConflicts: boolean
  readonly workingDirectory: WorkingDirectoryStatus

  readonly onDismissed: () => void
  readonly onContinueRebase: (step: ShowConflictsStep) => void
  readonly onAbortRebase: (step: ShowConflictsStep) => void
  readonly showRebaseConflictsBanner: (step: ShowConflictsStep) => void

  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

interface IShowConflictedFilesDialogState {
  readonly isAborting: boolean
}

export class ShowConflictedFilesDialog extends React.Component<
  IShowConflictedFilesDialogProps,
  IShowConflictedFilesDialogState
> {
  public constructor(props: IShowConflictedFilesDialogProps) {
    super(props)

    this.state = {
      isAborting: false,
    }
  }

  public componentWillUnmount() {
    const { workingDirectory, step, userHasResolvedConflicts } = this.props
    const { conflictState } = step
    const { manualResolutions } = conflictState

    // skip this work once we know conflicts have been resolved
    if (userHasResolvedConflicts) {
      return
    }

    const resolvedConflicts = getResolvedFiles(
      workingDirectory,
      manualResolutions
    )

    if (resolvedConflicts.length > 0) {
      this.props.dispatcher.setConflictsResolved(this.props.repository)
    }
  }

  private onCancel = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.setState({ isAborting: true })

    this.props.onAbortRebase(this.props.step)

    this.setState({ isAborting: false })
  }

  private onDismissed = () => {
    this.props.onDismissed()
    this.props.showRebaseConflictsBanner(this.props.step)
  }

  private onSubmit = async () => {
    this.props.onContinueRebase(this.props.step)
  }

  private renderHeaderTitle(targetBranch: string, baseBranch?: string) {
    if (baseBranch !== undefined) {
      return (
        <span>
          {`Resolve conflicts before rebasing `}
          <strong>{targetBranch}</strong>
          {` on `}
          <strong>{baseBranch}</strong>
        </span>
      )
    }
    return (
      <span>
        {`Resolve conflicts before rebasing `}
        <strong>{targetBranch}</strong>
      </span>
    )
  }

  private openThisRepositoryInShell = () =>
    this.props.openRepositoryInShell(this.props.repository)

  private renderUnmergedFiles(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    const {
      manualResolutions,
      targetBranch,
      baseBranch,
    } = this.props.step.conflictState

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
                manualResolution: manualResolutions.get(f.path),
                theirBranch: targetBranch,
                ourBranch: baseBranch,
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
    const { manualResolutions, targetBranch, baseBranch } = step.conflictState

    const unmergedFiles = getUnmergedFiles(workingDirectory)
    const conflictedFilesCount = getConflictedFiles(
      workingDirectory,
      manualResolutions
    ).length

    const headerTitle = this.renderHeaderTitle(targetBranch, baseBranch)

    const tooltipString =
      conflictedFilesCount > 0
        ? 'Resolve all conflicts before continuing'
        : undefined

    return (
      <Dialog
        id="rebase-conflicts-list"
        onDismissed={this.onDismissed}
        title={headerTitle}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          {this.renderContent(unmergedFiles, conflictedFilesCount)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Continue Rebase' : 'Continue rebase'}
            okButtonDisabled={conflictedFilesCount > 0}
            okButtonTitle={tooltipString}
            cancelButtonText={__DARWIN__ ? 'Abort Rebase' : 'Abort rebase'}
            cancelButtonDisabled={this.state.isAborting}
            onCancelButtonClick={this.onCancel}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
