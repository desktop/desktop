import * as React from 'react'
import { ChangesList } from './changes-list'
import FileDiff from '../file-diff'
import { IChangesState } from '../../lib/app-state'
import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { find } from '../../lib/find'

interface IChangesProps {
  repository: Repository
  changes: IChangesState
  dispatcher: Dispatcher
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, void> {
  private onCreateCommit(title: string) {
    this.props.dispatcher.commitSelectedChanges(this.props.repository, title)
  }

  private onSelectionChanged(row: number) {
    const file = this.props.changes.workingDirectory.files[row]
    this.props.dispatcher.changeChangesSelection(this.props.repository, file.path)
  }

  private onIncludeChanged(row: number, include: boolean) {
    const workingDirectory = this.props.changes.workingDirectory
    const foundFile = workingDirectory.files[row]
    if (!foundFile) {
      console.error('unable to find working directory path to apply included change: ' + row)
      return
    }

    const newFiles = this.props.changes.workingDirectory.files.map(f => {
      if (f.id === foundFile.id) {
        return f.withInclude(include)
      } else {
        return f
      }
    })

    this.props.dispatcher.changeChangedFiles(this.props.repository, newFiles)
  }

  private onSelectAll(selectAll: boolean) {
    this.props.dispatcher.changeIncludeAllFiles(this.props.repository, selectAll)
  }

  private renderNoSelection() {
    return (
      <div id='changes'>
        <div>No repo selected!</div>
      </div>
    )
  }

  public render() {

    const repo = this.props.repository
    if (!repo) {
      return this.renderNoSelection()
    }

    const selectedFile = find(this.props.changes.workingDirectory.files, f => {
      return f.path === this.props.changes.selectedPath
    })

    return (
      <div id='changes'>
        <ChangesList repository={this.props.repository}
                     workingDirectory={this.props.changes.workingDirectory}
                     selectedPath={this.props.changes.selectedPath!}
                     onSelectionChanged={event => this.onSelectionChanged(event)}
                     onCreateCommit={title => this.onCreateCommit(title)}
                     onIncludeChanged={(row, include) => this.onIncludeChanged(row, include) }
                     onSelectAll={selectAll => this.onSelectAll(selectAll) }/>

         <FileDiff repository={this.props.repository}
                   file={selectedFile ? selectedFile : null}
                   readOnly={false}
                   commit={null} />
      </div>
    )
  }
}
