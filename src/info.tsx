import * as React from 'react'

import Repository from './models/repository'

interface InfoProps {
  selectedRepo: Repository
}

interface InfoState {

}

export default class Info extends React.Component<InfoProps, InfoState> {
  private renderNoSelection() {
    return (
      <div>
        <div>No repo selected!</div>
      </div>
    )
  }

  private renderGitHubInfo() {
    const gitHubRepo = this.props.selectedRepo.getGitHubRepository()
    if (!gitHubRepo) {
      return <div>Not a GitHub repository</div>
    }

    return (
      <div>
        <div>Name: {gitHubRepo.getFullName()}</div>
        <div>URL: {gitHubRepo.getHTMLURL()}</div>
        <div>Private: {gitHubRepo.getPrivate() ? 'true' : 'false'}</div>
        <div>Fork: {gitHubRepo.getFork() ? 'true' : 'false'}</div>
      </div>
    )
  }

  public render() {
    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    return (
      <div>
        <div>Path: {repo.getPath()}</div>
        {this.renderGitHubInfo()}
      </div>
    )
  }
}
