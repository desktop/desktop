import * as React from 'react'

import User from './models/user'
import Repository from './models/repository'
import IWorkingDirectoryStatus from './models/status'

import RepositoryService from './lib/repository-service'

interface InfoProps {
  selectedRepo: Repository,
  user: User
}

interface InfoState {
  workingDirectory: IWorkingDirectoryStatus
}

export default class Info extends React.Component<InfoProps, InfoState> {

  public componentWillReceiveProps(nextProps: InfoProps) {
    RepositoryService.getStatus(this.props.selectedRepo).then(function(wd) {
      this.setState({ workingDirectory: wd })
    })
  }

  public shouldComponentUpdate(nextProps: InfoProps, nextState: InfoState): Boolean {
    return true
  }

  public componentWillUpdate(nextProps: InfoProps, nextState: InfoState): Boolean {
    return true
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

    return (
      <div>{repo.getPath()}</div>
    )
  }
}
