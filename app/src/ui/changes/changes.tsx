import * as React from 'react'
import { Diff } from '../diff'
import { ChangedFileDetails } from './changed-file-details'
import { DiffSelection, IDiff, ImageDiffType } from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

interface IChangesProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff
  readonly dispatcher: Dispatcher
  readonly imageDiffType: ImageDiffType

  /** Whether a commit is in progress */
  readonly isCommitting: boolean
  readonly hideWhitespaceInDiff: boolean
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
            diff={diff}
            dispatcher={this.props.dispatcher}
            hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
          />
        </div>
      </div>
    )
  }
}
