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
        workingDirectory: result.getWorkingDirectory()
      }))
  }

  public componentWillReceiveProps(nextProps: ChangesListProps) {
    this.refresh(nextProps.repository)
  }

  private onIncludedChange(file: WorkingDirectoryFileChange, include: boolean) {
    file.setIncluded(include)
  }

  private async onCreateCommit(title: string) {
    const files = this.state.workingDirectory.getFiles().filter(function(file, index, array) {
      return file.getIncluded() === true
    })

    await LocalGitOperations.createCommit(this.props.repository, title, files)

    await this.refresh(this.props.repository)
  }

  public render() {

    const files = this.state.workingDirectory.getFiles()

    return (
      <div id='changes-list'>
        <ul>{files.map(file => {
          const path = file.getPath()
          return <ChangedFile path={path}
                              status={file.getStatus()}
                              key={path}
                              onIncludedChange={include => this.onIncludedChange(file, include)}/>
        })}
        </ul>
        <CommitMessage onCreateCommit={title => this.onCreateCommit(title)}/>
      </div>
    )
  }
}
