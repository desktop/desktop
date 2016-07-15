import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'

import Repository from '../../models/repository'
import { WorkingDirectoryStatus, WorkingDirectoryFileChange} from '../../models/status'

import { LocalGitOperations } from '../../lib/local-git-operations'

interface ChangesListProps {
  repository: Repository
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

  private onIncludedChange(file: WorkingDirectoryFileChange, include: boolean) {

    const workingDirectory = this.state.workingDirectory

    const foundFile = workingDirectory.files.find((f, index, array) => {
      return f.path === file.path
    })

    if (foundFile) {
      foundFile.include = include

      this.setState({ workingDirectory: workingDirectory })
    } else {
      console.error('unable to find working directory path to apply included change: ' + file.path)
    }
  }

  private handleSelectAll(event: React.FormEvent) {
    const include = (event.target as any).checked

    const workingDirectory = this.state.workingDirectory

    workingDirectory.setIncludeAll(include)

    this.setState({ workingDirectory: workingDirectory })
  }


  private async onCreateCommit(title: string) {
    const files = this.state.workingDirectory.files.filter(function(file, index, array) {
      return file.include === true
    })

    await LocalGitOperations.createCommit(this.props.repository, title, files)

    await this.refresh(this.props.repository)
  }

  public render() {

    const files = this.state.workingDirectory.files

    return (
      <div id='changes-list'>
        <div id='select-all'>
          <input
            type='checkbox'
            defaultChecked='true'
            onChange={event => this.handleSelectAll(event)}
          />
        </div>
        <ul>{files.map(file => {
          const path = file.path
          return <ChangedFile path={path}
                              status={file.status}
                              key={path}
                              include={file.include}
                              onIncludedChange={include => this.onIncludedChange(file, include)}/>
        })}
        </ul>
        <CommitMessage onCreateCommit={title => this.onCreateCommit(title)}/>
      </div>
    )
  }
}
