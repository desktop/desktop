import * as React from 'react'
import { DialogContent, Dialog, DialogFooter } from '../dialog'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { DialogHeader } from '../dialog/header'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
} from '../../models/status'
import {
  getUnmergedFiles,
  getConflictedFiles,
  isConflictedFile,
} from '../../lib/status'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { BannerType } from '../../models/banner'
import { PopupType } from '../../models/popup'
import {
  renderUnmergedFilesSummary,
  renderShellLink,
  renderAllResolved,
} from '../lib/conflicts/render-functions'
import { renderUnmergedFile } from '../lib/conflicts/unmerged-file'

interface IRebaseConflictsDialog {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly targetBranch: string
  readonly baseBranch?: string
  readonly onDismissed: () => void
  readonly workingDirectory: WorkingDirectoryStatus
  readonly manualResolutions: Map<string, ManualConflictResolution>
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

export class RebaseConflictsDialog extends React.Component<
  IRebaseConflictsDialog,
  {}
> {
  public async componentDidMount() {
    this.props.dispatcher.resolveCurrentEditor()
  }

  private onCancel = async () => {
    await this.props.dispatcher.abortRebase(this.props.repository)
    this.props.onDismissed()
  }

  private onDismissed = () => {
    this.props.dispatcher.setBanner({
      type: BannerType.RebaseConflictsFound,
      targetBranch: this.props.targetBranch,
      popup: {
        type: PopupType.RebaseConflicts,
        targetBranch: this.props.targetBranch,
        baseBranch: this.props.baseBranch,
        repository: this.props.repository,
      },
    })
    this.props.onDismissed()
  }

  private onSubmit = async () => {
    await this.props.dispatcher.continueRebase(
      this.props.repository,
      this.props.workingDirectory
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
              Continue rebase
            </Button>
            <Button onClick={this.onCancel}>Abort rebase</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
