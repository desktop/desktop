import * as React from 'react'

import {
  DefaultDialogFooter,
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { IConflictResolutionProgress } from '../../lib/copilot-conflict-resolution'
import { plural } from '../lib/plural'
import { PathText } from '../lib/path-text'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IResolveConflictsWithCopilotDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly conflictedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  readonly canResolveWithCopilot: boolean
  readonly onDismissed: () => void
}

interface IResolveConflictsWithCopilotDialogState {
  readonly isResolving: boolean
  readonly progress: IConflictResolutionProgress | null
}

type FileProgressStatus = 'pending' | 'resolving' | 'done'

export class ResolveConflictsWithCopilotDialog extends React.Component<
  IResolveConflictsWithCopilotDialogProps,
  IResolveConflictsWithCopilotDialogState
> {
  public constructor(props: IResolveConflictsWithCopilotDialogProps) {
    super(props)
    this.state = { isResolving: false, progress: null }
  }

  public render() {
    if (!this.props.canResolveWithCopilot) {
      return this.renderUnavailable()
    }

    const fileCount = this.props.conflictedFiles.length
    const bodyId = 'resolve-conflicts-with-copilot-body'

    return (
      <Dialog
        title="Resolve conflicts with Copilot?"
        id="resolve-conflicts-with-copilot"
        type="warning"
        loading={this.state.isResolving}
        disabled={this.state.isResolving}
        dismissDisabled={this.state.isResolving}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        ariaDescribedBy={bodyId}
        role="alertdialog"
      >
        <DialogContent>
          <p id={bodyId}>{this.renderMessage(fileCount)}</p>
          {this.renderFileList()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              this.state.isResolving ? 'Resolving' : 'Resolve with Copilot'
            }
            okButtonDisabled={this.state.isResolving}
            cancelButtonDisabled={this.state.isResolving}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderMessage(fileCount: number) {
    const { isResolving, progress } = this.state

    if (isResolving) {
      return (
        <>
          Copilot is resolving conflicts. {progress?.filesResolved ?? 0} of{' '}
          {fileCount} file{plural(fileCount)} done.
        </>
      )
    }

    return (
      <>
        Desktop found unresolved conflict markers in {fileCount} file
        {plural(fileCount)}. Copilot can suggest resolved file contents and
        stage the resolved files. Review the changes before committing.
      </>
    )
  }

  private getFileStatus(path: string): FileProgressStatus {
    const { progress } = this.state

    if (progress?.resolvedFilePaths.includes(path) === true) {
      return 'done'
    }

    if (progress?.activeFilePaths.includes(path) === true) {
      return 'resolving'
    }

    return 'pending'
  }

  private getFileStatusLabel(status: FileProgressStatus) {
    switch (status) {
      case 'done':
        return 'Done'
      case 'resolving':
        return 'Resolving'
      case 'pending':
        return 'Pending'
    }
  }

  private getFileStatusIcon(status: FileProgressStatus) {
    switch (status) {
      case 'done':
        return octicons.check
      case 'resolving':
        return octicons.sync
      case 'pending':
        return octicons.clock
    }
  }

  private renderFileList() {
    return (
      <ul className="copilot-conflict-progress-list">
        {this.props.conflictedFiles.map(file => {
          const status = this.getFileStatus(file.path)
          return (
            <li
              key={file.path}
              className={`copilot-conflict-progress-file ${status}`}
              data-path={file.path}
              aria-label={`${file.path}: ${this.getFileStatusLabel(status)}`}
            >
              <Octicon
                className="copilot-conflict-progress-icon"
                symbol={this.getFileStatusIcon(status)}
              />
              <PathText path={file.path} />
              <span className="copilot-conflict-progress-status">
                {this.getFileStatusLabel(status)}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  private renderUnavailable() {
    const bodyId = 'resolve-conflicts-with-copilot-unavailable-body'

    return (
      <Dialog
        title="Resolve conflicts before generating a commit message"
        id="resolve-conflicts-with-copilot-unavailable"
        type="warning"
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
        ariaDescribedBy={bodyId}
        role="alertdialog"
      >
        <DialogContent>
          <p id={bodyId}>
            Desktop found unresolved conflict markers. Resolve the conflicted
            files before generating a commit message.
          </p>
        </DialogContent>
        <DefaultDialogFooter buttonText="OK" />
      </Dialog>
    )
  }

  private onSubmit = async () => {
    this.setState({ isResolving: true, progress: null })
    await this.props.dispatcher.startCopilotConflictResolution(
      this.props.repository,
      progress => {
        this.setState({ progress })
      }
    )
    this.props.onDismissed()
  }
}
