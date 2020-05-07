import * as React from 'react'
import { Diff } from '../diff'
import { ChangedFileDetails } from './changed-file-details'
import {
  DiffSelection,
  IDiff,
  ImageDiffType,
  ITextDiff,
} from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import { DiscardType } from '../discard-changes/discard-changes-dialog'

interface IChangesProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff
  readonly dispatcher: Dispatcher
  readonly imageDiffType: ImageDiffType

  /** Whether a commit is in progress */
  readonly isCommitting: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
}

export class Changes extends React.Component<IChangesProps, {}> {
  private onDiffLineIncludeChanged = (diffSelection: DiffSelection) => {
    const file = this.props.file
    this.props.dispatcher.changeFileLineSelection(
      this.props.repository,
      file,
      diffSelection
    )
  }

  private onDiscardChanges = (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => {
    if (!this.props.askForConfirmationOnDiscardChanges) {
      this.discardChanges(diff, diffSelection)
    } else {
      this.props.dispatcher.showPopup({
        type: PopupType.ConfirmDiscardChanges,
        discardType: DiscardType.Selection,
        files: [this.props.file],
        onSubmit: () => this.discardChanges(diff, diffSelection),
      })
    }
  }

  private discardChanges(diff: ITextDiff, diffSelection: DiffSelection) {
    return this.props.dispatcher.discardChangesFromSelection(
      this.props.repository,
      this.props.file.path,
      diff,
      diffSelection
    )
  }

  public render() {
    const diff = this.props.diff
    const file = this.props.file
    const isCommitting = this.props.isCommitting
    return (
      <div className="changed-file">
        <ChangedFileDetails path={file.path} status={file.status} diff={diff} />

        <div className="diff-wrapper">
          <Diff
            repository={this.props.repository}
            imageDiffType={this.props.imageDiffType}
            file={file}
            readOnly={isCommitting}
            onIncludeChanged={this.onDiffLineIncludeChanged}
            onDiscardChanges={this.onDiscardChanges}
            diff={diff}
            dispatcher={this.props.dispatcher}
            hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
            askForConfirmationOnDiscardChanges={
              this.props.askForConfirmationOnDiscardChanges
            }
          />
        </div>
      </div>
    )
  }
}
