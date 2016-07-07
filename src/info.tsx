import * as React from 'react'

import User from './models/user'
import Repository from './models/repository'
import { FileStatus, WorkingDirectoryStatus} from './models/status'

import RepositoryService from './lib/repository-service'

import ChangedFile from './changed-file'

interface InfoProps {
  selectedRepo: Repository,
  user: User
}

interface InfoState {
  workingDirectory: WorkingDirectoryStatus
}

export default class Info extends React.Component<InfoProps, InfoState> {

  public constructor(props: InfoProps) {
    super(props)

    this.state = {
      workingDirectory: new WorkingDirectoryStatus()
    }
  }

  public componentWillReceiveProps(nextProps: InfoProps) {
    RepositoryService.getStatus(nextProps.selectedRepo)
      .then(directory => this.setState({ workingDirectory: directory }))
  }

  private renderNoSelection() {
    return (
      <div>
        <div>No repo selected!</div>
      </div>
    )
  }

 // TODO: we also get the index status here
 // maybe we should look at all these values too
 // https://github.com/libgit2/libgit2/blob/77394a27af283b366fa8bb444d29670131bfa104/include/git2/status.h#L32-L50
  private mapStatus(status: number): FileStatus {
    if (status | 512) {
      return FileStatus.Deleted
    } else if (status | 256) {
      return FileStatus.Modified
    } else if (status | 128) {
      return FileStatus.New
    } else {
      console.log('Unknown file status encountered: ' + status)
      return FileStatus.Unknown
    }
  }

  public render() {
    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    const files = this.state.workingDirectory.getFiles()

    return (
      <div>
        <div>{repo.getPath()}</div>
        <br />
        <ul>{files.map(file => {
          const path = file.getPath()
          const status = this.mapStatus(file.getStatus())
          return <ChangedFile path={path} status={status} key={path} />
        })}
        </ul>
      </div>
    )
  }
}
