import * as React from 'react'
import { DialogContent, Dialog, DialogFooter } from '../dialog'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import {
  getUnmergedFiles,
  getConflictedFiles,
  isConflictedFile,
} from '../../lib/status'
import { Repository } from '../../models/repository'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import {
  renderUnmergedFilesSummary,
  renderShellLink,
  renderAllResolved,
} from '../lib/conflicts/render-functions'
import { renderUnmergedFile } from '../lib/conflicts/unmerged-file'
import { Dispatcher } from '../dispatcher'

interface IShowConflictedFilesDialog {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly targetBranch: string
  readonly baseBranch?: string
  readonly onDismissed: () => void
  readonly onAbortRebase: () => void
  readonly showRebaseConflictsBanner: () => void
  readonly workingDirectory: WorkingDirectoryStatus
  readonly manualResolutions: Map<string, ManualConflictResolution>
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

export class ShowConflictedFilesDialog extends React.Component<
  IShowConflictedFilesDialog,
  {}
> {
  public async componentDidMount() {
    this.props.dispatcher.resolveCurrentEditor()
  }

  private onCancel = async () => {
    this.props.onAbortRebase()
  }

  private onDismissed = () => {
    this.props.onDismissed()
    this.props.showRebaseConflictsBanner()
  }

  private onSubmit = async () => {
    await this.props.dispatcher.continueRebase(
      this.props.repository,
      this.props.workingDirectory,
      this.props.manualResolutions
    )
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
                theirBranch: this.props.targetBranch,
                ourBranch: this.props.baseBranch,
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
      this.props.targetBranch,
      this.props.baseBranch
    )

    const tooltipString =
      conflictedFilesCount > 0
        ? 'Resolve all conflicts before continuing'
        : undefined

    return (
      <Dialog
        id="rebase-conflicts-list"
        dismissable={true}
        onDismissed={this.onDismissed}
        title={headerTitle}
        disableClickDismissalAlways={true}
        onSubmit={this.onSubmit}
      >
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
              Continue rebase
            </Button>
            <Button onClick={this.onCancel}>Abort rebase</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
