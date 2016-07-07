import * as React from 'react'

import User from './models/user'
import Repository from './models/repository'
import { WorkingDirectoryStatus} from './models/status'

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
          return <ChangedFile path={path} key={path} />
        })}
        </ul>
      </div>
    )
  }
}
