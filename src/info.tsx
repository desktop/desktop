import * as React from 'react'

import User from './models/user'
import Repository from './models/repository'
import { WorkingDirectoryStatus} from './models/status'

import LocalGitOperations from './lib/local-git-operations'

import ChangedFile from './changed-file'

interface InfoProps {
  selectedRepo: Repository,
  user: User
}

interface InfoState {
  exists: boolean
  workingDirectory: WorkingDirectoryStatus
}

export default class Info extends React.Component<InfoProps, InfoState> {

  public constructor(props: InfoProps) {
    super(props)

    this.state = {
      workingDirectory: new WorkingDirectoryStatus(),
      exists: true
    }
  }

  public componentWillReceiveProps(nextProps: InfoProps) {
    LocalGitOperations.getStatus(nextProps.selectedRepo)
      .then(result => this.setState({
        exists: result.getExists(),
        workingDirectory: result.getWorkingDirectory()
      }))
  }

  private renderNoSelection() {
    return (
      <div>
        <div>No repo selected!</div>
      </div>
    )
  }

  private renderNotFound() {
    return (
      <div>
        <div>Repository not found at this location...</div>
      </div>
    )
  }


  public render() {
    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    if (!this.state.exists) {
        return this.renderNotFound()
    }

    const files = this.state.workingDirectory.getFiles()

    return (
      <div>
        <div>{repo.getPath()}</div>
        <br />
        <ul>{files.map(file => {
          const path = file.getPath()
          return <ChangedFile path={path} status={file.getStatus()} key={path} />
        })}
        </ul>
      </div>
    )
  }
}
