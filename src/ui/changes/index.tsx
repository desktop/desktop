import * as React from 'react'
import { ChangesList } from './changes-list'
import FileDiff from '../file-diff'

import Repository from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'


import { LocalGitOperations } from '../../lib/local-git-operations'

interface ChangesProps {
  selectedRepo: Repository,

}

interface ChangesState {
  selectedRow: number,
  workingDirectory: WorkingDirectoryStatus
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<ChangesProps, ChangesState> {

  public constructor(props: ChangesProps) {
    super(props)

    this.state = {
      selectedRow: -1,
      workingDirectory: new WorkingDirectoryStatus()
    }
  }

  public componentWillReceiveProps(nextProps: ChangesProps) {
    this.refreshWorkingDirectory(nextProps.selectedRepo)
  }

  private refreshWorkingDirectory(repository: Repository) {
    LocalGitOperations.getStatus(repository)
      .then(result => this.setState(Object.assign({}, this.state, {workingDirectory: result.workingDirectory})))
      .catch(rejected => {
        console.error(rejected)
        this.setState(Object.assign({}, this.state, {workingDirectory: new WorkingDirectoryStatus()}))
    })
  }

  private handleSelectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, {selectedRow: row}))

    // TODO: show file diff for selected item
  }

  private handleIncludeChanged(row: number, include: boolean) {

    const workingDirectory = this.state.workingDirectory

    const foundFile = workingDirectory.files[row]

    if (!foundFile) {
      console.error('unable to find working directory path to apply included change: ' + row)
      return
    }

    foundFile.include = include

    const allSelected = workingDirectory.files.every((f, index, array) => {
      return f.include
    })

    const noneSelected = workingDirectory.files.every((f, index, array) => {
      return !f.include
    })

    if (allSelected && !noneSelected) {
      workingDirectory.includeAll = true
    } else if (!allSelected && noneSelected) {
      workingDirectory.includeAll = false
    } else {
      workingDirectory.includeAll = null
    }

    this.setState(Object.assign({}, this.state, { workingDirectory: workingDirectory }))
  }

  private handleSelectAll(selectAll: boolean) {
    const workingDirectory = this.state.workingDirectory

    workingDirectory.includeAll = selectAll
    workingDirectory.includeAllFiles(selectAll)

    this.setState(Object.assign({}, this.state, { workingDirectory: workingDirectory }))
  }

  private renderNoSelection() {
    return (
      <div id='changes'>
        <div>No repo selected!</div>
      </div>
    )
  }

  public render() {

    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    return (
      <div id='changes'>
        <ChangesList repository={this.props.selectedRepo}
                     workingDirectory={this.state.workingDirectory}
                     selectedRow={this.state.selectedRow}
                     onSelectionChanged={event => this.handleSelectionChanged(event)}
                     onIncludeChanged={(row, include) => this.handleIncludeChanged(row, include) }
                     onSelectAll={selectAll => this.handleSelectAll(selectAll) }/>
        <FileDiff/>
      </div>
    )
  }
}
