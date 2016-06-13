import {shell} from 'electron'
import * as React from 'react'

import User from './user'
import {Repo} from './lib/api'

const LOLZ2: OcticonSymbol[] = [
  OcticonSymbol.x,
  OcticonSymbol.alert,
  OcticonSymbol.clippy,
  OcticonSymbol.calendar,
  OcticonSymbol.diff_removed
]

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

    const symbol = LOLZ2[row % LOLZ2.length]
    return (
      <div style={ContainerStyle}>
        Stars: {repo.stargazersCount}

        <button onClick={() => shell.openExternal(repo.htmlUrl)}>Open</button>
      </div>
    )
  }
}
