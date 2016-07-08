import * as React from 'react'

import User from './models/user'
import {default as Repo} from './models/repository'
import Toolbar from './toolbar'
import Changes from './changes'
import History from './history'
import ComparisonGraph from './comparison-graph'

interface RepositoryProps {
  repo: Repo,
  user: User
}

interface RepositoryState {
  selectedTab: 'changes' | 'history'
}

export default class Repository extends React.Component<RepositoryProps, RepositoryState> {
  public constructor(props: RepositoryProps) {
    super(props)

    this.state = {selectedTab: 'changes'}
  }

  private renderNoSelection() {
    return (
      <div>
        <div>No repo selected!</div>
      </div>
    )
  }

  private renderContent() {
    if (this.state.selectedTab === 'changes') {
      return <Changes/>
    } else if (this.state.selectedTab === 'history') {
      return <History/>
    } else {
      return null
    }
  }

  public render() {
    const repo = this.props.repo
    if (!repo) {
      return this.renderNoSelection()
    }

    return (
      <div id='repository'>
        <Toolbar/>
        <ComparisonGraph/>
        {this.renderContent()}
      </div>
    )
  }
}
