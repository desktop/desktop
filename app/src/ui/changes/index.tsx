import * as React from 'react'
import { Diff } from '../diff'
import { ChangedFileDetails } from './changed-file-details'
import { DiffSelection, IDiff } from '../../models/diff'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'

// At some point we'll make index.tsx only be exports
// see https://github.com/desktop/desktop/issues/383
export { ChangesSidebar } from './sidebar'

interface IChangesProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly diff: IDiff
  readonly dispatcher: Dispatcher
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
          oldPath={file.oldPath}
          status={file.status}
          diff={diff}
        />

        <div className="diff-wrapper">
          <Diff
            repository={this.props.repository}
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
}
