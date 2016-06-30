import {shell} from 'electron'
import * as React from 'react'

import User from './user'
import {Repo} from './lib/api'

interface InfoProps {
  selectedRepo: Repo,
  user: User
}

interface InfoState {

}

const ContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1
}

export default class Info extends React.Component<InfoProps, InfoState> {
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
      <div style={ContainerStyle}>
        <h1>{repo.name}</h1>
        Stars: {repo.stargazersCount}

        <button onClick={() => shell.openExternal(repo.htmlUrl)}>Open</button>
      </div>
    )
  }
}
