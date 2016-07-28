import * as React from 'react'
import { ChangesList } from './changes-list'
import FileDiff from '../file-diff'

import Repository from '../../models/repository'
import { WorkingDirectoryStatus, FileChange } from '../../models/status'


import { LocalGitOperations } from '../../lib/local-git-operations'

interface IChangesProps {
  repository: Repository
}

interface IChangesState {
  selectedRow: number
  workingDirectory: WorkingDirectoryStatus
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, IChangesState> {

  public constructor(props: IChangesProps) {
    super(props)

    this.state = {
      selectedRow: -1,
      workingDirectory: new WorkingDirectoryStatus()
    }
  }

  public componentWillReceiveProps(nextProps: IChangesProps) {

    // reset selection (if found)
    Object.assign({}, this.state, { selectedRow: -1 })

    this.refreshWorkingDirectory(nextProps.repository)
  }

  private refreshWorkingDirectory(repository: Repository) {
    LocalGitOperations.getStatus(repository)
      .then(result => {
        this.setState(Object.assign({}, this.state, { workingDirectory: result.workingDirectory }))
      })
      .catch(rejected => {
        console.error(rejected)
        this.setState(Object.assign({}, this.state, { workingDirectory: new WorkingDirectoryStatus() }))
    })
  }

  private async onCreateCommit(title: string) {
    const files = this.state.workingDirectory.files.filter(function(file, index, array) {
      return file.include === true
    })

    await LocalGitOperations.createCommit(this.props.repository, title, files)

    await this.refreshWorkingDirectory(this.props.repository)
  }

  private handleSelectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, { selectedRow: row }))

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

    const repo = this.props.repository
    if (!repo) {
      return this.renderNoSelection()
    }

    const row = this.state.selectedRow
    let selectedFile: FileChange | null = null
    if (row > -1) {
      const file = this.state.workingDirectory.files[row]
      if (file) {
        selectedFile = file
      }
    }

    return (
      <div className='panel-container show-border' id='changes'>
        <ChangesList repository={this.props.repository}
                     workingDirectory={this.state.workingDirectory}
                     selectedRow={this.state.selectedRow}
                     onSelectionChanged={event => this.handleSelectionChanged(event)}
                     onCreateCommit={title => this.onCreateCommit(title)}
                     onIncludeChanged={(row, include) => this.handleIncludeChanged(row, include) }
                     onSelectAll={selectAll => this.handleSelectAll(selectAll) }/>

         <FileDiff repository={this.props.repository}
                   file={selectedFile}
                   readOnly={false}
                   commit={null} />
      </div>
    )
  }
}
