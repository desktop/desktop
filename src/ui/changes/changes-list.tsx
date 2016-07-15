import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import List from '../list'

import Repository from '../../models/repository'
import { WorkingDirectoryStatus, WorkingDirectoryFileChange} from '../../models/status'

import { LocalGitOperations } from '../../lib/local-git-operations'

const RowHeight = 20

interface ChangesListProps {
  repository: Repository,
  readonly selectedRow: number
  readonly onSelectionChanged: (row: number) => void
}

interface ChangesListState {
  workingDirectory: WorkingDirectoryStatus
}

export class ChangesList extends React.Component<ChangesListProps, ChangesListState> {

  public constructor(props: ChangesListProps) {
    super(props)

    this.state = {
      workingDirectory: new WorkingDirectoryStatus()
    }
  }

  private refresh(repository: Repository) {
    LocalGitOperations.getStatus(repository)
      .then(result => this.setState({
        workingDirectory: result.workingDirectory
      }))
      .catch(rejected => {
        console.error(rejected)
        this.setState({
         workingDirectory: new WorkingDirectoryStatus()
       })
    })
  }

  public componentWillReceiveProps(nextProps: ChangesListProps) {
    this.refresh(nextProps.repository)
  }

  private onIncludeChanged(file: WorkingDirectoryFileChange, include: boolean) {

    const workingDirectory = this.state.workingDirectory

    const foundFile = workingDirectory.files.find((f, index, array) => {
      return f.path === file.path
    })

    if (!foundFile) {
      console.error('unable to find working directory path to apply included change: ' + file.path)
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

    this.setState({ workingDirectory: workingDirectory })
  }

  private handleSelectAll(event: React.FormEvent) {
    const include = (event.target as any).checked

    const workingDirectory = this.state.workingDirectory

    workingDirectory.includeAll = include
    workingDirectory.includeAllFiles(include)

    this.setState({ workingDirectory: workingDirectory })
  }


  private async onCreateCommit(title: string) {
    const files = this.state.workingDirectory.files.filter(function(file, index, array) {
      return file.include === true
    })

    await LocalGitOperations.createCommit(this.props.repository, title, files)

    await this.refresh(this.props.repository)
  }

  private renderRow(row: number): JSX.Element {
    const file = this.state.workingDirectory.files[row]
    const path = file.path

    return (
      <ChangedFile path={path}
                   status={file.status}
                   include={file.include}
                   key={path}
                   onIncludeChanged={include => this.onIncludeChanged(file, include)}/>
    )
  }

  public render() {

    const includeAll = this.state.workingDirectory.includeAll

    return (
      <div id='changes-list'>
        <div id='select-all'>
          <input
            type='checkbox'
            checked={includeAll}
            onChange={event => this.handleSelectAll(event)}
            ref={function(input) {
              if (input != null) {
                input.indeterminate = (includeAll === null)
              }
            }} />
        </div>

        <List id='changes-list-list'
              itemCount={this.state.workingDirectory.files.length}
              itemHeight={RowHeight}
              renderItem={row => this.renderRow(row)}
              selectedRow={this.props.selectedRow}
              onSelectionChanged={row => this.props.onSelectionChanged(row)} />

        <CommitMessage onCreateCommit={title => this.onCreateCommit(title)}/>
      </div>
    )
  }
}
