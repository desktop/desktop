import * as React from 'react'
import { Diff } from '../diff'
import { ChangedFileDetails } from './changed-file-details'
import { DiffSelection, IDiff, ImageDiffType } from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'

interface IChangesProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff
  readonly dispatcher: Dispatcher
  readonly imageDiffType: ImageDiffType
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
    return (
      <div className="changed-file">
        <ChangedFileDetails
          path={file.path}
          status={file.status}
          diff={diff}
          onOpenMergeTool={this.onOpenMergeTool}
        />

        <div className="diff-wrapper">
          <Diff
            repository={this.props.repository}
            imageDiffType={this.props.imageDiffType}
            file={file}
            readOnly={false}
            onIncludeChanged={this.onDiffLineIncludeChanged}
            diff={diff}
            dispatcher={this.props.dispatcher}
          />
        </div>
      </div>
    )
  }

  private onOpenMergeTool = (path: string) => {
    this.props.dispatcher.openMergeTool(this.props.repository, path)
  }
}
