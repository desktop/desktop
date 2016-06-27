import {shell} from 'electron'
import * as React from 'react'

import User from './user'
import {Repo} from './lib/api'

import {Octicon, OcticonSymbol} from './ui/octicons'
import {console as remoteConsole, ping} from './shared-process/interface'

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

  private iconForRepo(repo: Repo): OcticonSymbol {

    if (repo.private) { return OcticonSymbol.lock }
    if (repo.fork) { return OcticonSymbol.repoForked }

    return OcticonSymbol.repo
  }

  public render() {
    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    const symbol = this.iconForRepo(repo)

    return (
      <div style={ContainerStyle}>
        <h1><Octicon height={32} width={32} symbol={symbol} /> {repo.name}</h1>
        Stars: {repo.stargazersCount}

        <button onClick={() => this.onOpen()}>Open</button>
      </div>
    )
  }

  private async onOpen() {
    // const repo = this.props.selectedRepo
    // shell.openExternal(repo.htmlUrl)

    remoteConsole.log('hey', 'there')

    const start = Date.now()
    const response = await ping()
    const end = Date.now()
    console.log(`Roundtrip: ${end - start}`)
    console.log(`Response: ${response}`)
  }
}
