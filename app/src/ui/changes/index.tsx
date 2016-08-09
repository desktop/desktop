import * as React from 'react'
import { ChangesList } from './changes-list'
import FileDiff from '../file-diff'
import { IChangesState } from '../../lib/app-state'
import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { Resizable } from '../resizable'

interface IChangesProps {
  repository: Repository
  changes: IChangesState
  dispatcher: Dispatcher
  branch: string | null
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, void> {
  private onCreateCommit(title: string) {
    this.props.dispatcher.commitIncludedChanges(this.props.repository, title)
  }

  private onSelectionChanged(row: number) {
    const file = this.props.changes.workingDirectory.files[row]
    this.props.dispatcher.changeChangesSelection(this.props.repository, file)
  }

  private onIncludeChanged(row: number, include: boolean) {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files[row]
    if (!file) {
      console.error('unable to find working directory path to apply included change: ' + row)
      return
    }

    this.props.dispatcher.changeFileIncluded(this.props.repository, file, include)
  }

  private onSelectAll(selectAll: boolean) {
    this.props.dispatcher.changeIncludeAllFiles(this.props.repository, selectAll)
  }

  public render() {
    const selectedPath = this.props.changes.selectedFile ? this.props.changes.selectedFile!.path : null
    return (
      <div className='panel-container'>
        <Resizable configKey='changes-width'>
          <ChangesList repository={this.props.repository}
                       workingDirectory={this.props.changes.workingDirectory}
                       selectedPath={selectedPath}
                       onSelectionChanged={event => this.onSelectionChanged(event)}
                       onCreateCommit={title => this.onCreateCommit(title)}
                       onIncludeChanged={(row, include) => this.onIncludeChanged(row, include) }
                       onSelectAll={selectAll => this.onSelectAll(selectAll) }
                       branch={this.props.branch}/>
        </Resizable>

        <FileDiff repository={this.props.repository}
                  file={this.props.changes.selectedFile}
                  readOnly={false}
                  commit={null} />
      </div>
    )
  }
}
