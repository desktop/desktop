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
  readonly file: WorkingDirectoryFileChange | null
  readonly diff: IDiff | null
  readonly dispatcher: Dispatcher
}

export class Changes extends React.Component<IChangesProps, void> {

  private onDiffLineIncludeChanged = (diffSelection: DiffSelection) => {
    const file = this.props.file
    if (!file) {
      console.error('Diff line selection changed despite no file. This is a deep mystery.')
      return
    }

    this.props.dispatcher.changeFileLineSelection(this.props.repository, file, diffSelection)
  }

  public render() {
    const diff = this.props.diff
    const file = this.props.file
    if (!diff || !file) {
      return (
        <div className='panel blankslate' id='diff'>
          No file selected
        </div>
      )
    }

    return (
      <div className='changed-file'>
        <ChangedFileDetails
          path={file.path}
          oldPath={file.oldPath}
          status={file.status} />

        <div className='diff-wrapper'>
          <Diff repository={this.props.repository}
            file={file}
            readOnly={false}
            onIncludeChanged={this.onDiffLineIncludeChanged}
            diff={diff}
            dispatcher={this.props.dispatcher} />
         </div>
       </div>
    )
  }
}
