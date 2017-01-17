import * as React from 'react'
import { Diff } from '../diff'
import { ChangedFileDetails } from './changed-file-details'
import { DiffSelection } from '../../models/diff'
import { IChangesState } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'

// At some point we'll make index.tsx only be exports
// see https://github.com/desktop/desktop/issues/383
export { ChangesSidebar } from './sidebar'

interface IChangesProps {
  readonly repository: Repository
  readonly changes: IChangesState
  readonly dispatcher: Dispatcher
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, void> {

  private onDiffLineIncludeChanged = (diffSelection: DiffSelection) => {
    const file = this.props.changes.selectedFile
    if (!file) {
      console.error('diff line selection changed despite no file error - what?')
      return
    }

    this.props.dispatcher.changeFileLineSelection(this.props.repository, file, diffSelection)
  }

  public render() {
    const diff = this.props.changes.diff
    const file = this.props.changes.selectedFile
    let fileName: string | null = null

    if (file) {
      fileName = file.path
    }

    if (!diff || !file) {
      return (
        <div className='panel blankslate' id='diff'>
          No file selected
        </div>
      )
    }

    return (
      <div>
        <ChangedFileDetails fileName={fileName} />
        <Diff repository={this.props.repository}
          file={file}
          readOnly={false}
          onIncludeChanged={this.onDiffLineIncludeChanged}
          diff={diff}
          dispatcher={this.props.dispatcher} />
      </div>
    )
  }
}
