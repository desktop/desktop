import * as React from 'react'

import User from '../models/user'
import {default as Repo} from '../models/repository'
import Toolbar from './toolbar'
import Changes from './changes'
import History from './history'
import ComparisonGraph from './comparison-graph'
import {TabBarTab} from './toolbar/tab-bar'

interface RepositoryProps {
  repo: Repo,
  user: User
}

interface RepositoryState {
  selectedTab: TabBarTab
}

export default class Repository extends React.Component<RepositoryProps, RepositoryState> {
  public constructor(props: RepositoryProps) {
    super(props)

    this.state = {selectedTab: TabBarTab.Changes}
  }

  public componentDidMount() {
    this.repositoryChanged()
  }

  public componentDidUpdate(prevProps: RepositoryProps, prevState: RepositoryState) {
    const changed = prevProps.repo.getID() !== this.props.repo.getID()
    if (changed) {
      this.repositoryChanged()
    }
  }

  private renderNoSelection() {
    return (
      <div>
        <div>No repo selected!</div>
      </div>
    )
  }

  private renderContent() {
    if (this.state.selectedTab === TabBarTab.Changes) {
      return <Changes selectedRepo={this.props.repo}/>
    } else if (this.state.selectedTab === TabBarTab.History) {
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
        <Toolbar selectedTab={this.state.selectedTab} onTabClicked={tab => this.onTabClicked(tab)}/>
        <ComparisonGraph/>
        {this.renderContent()}
      </div>
    )
  }

  private onTabClicked(tab: TabBarTab) {
    this.setState(Object.assign({}, this.state, {selectedTab: tab}))
  }

  private repositoryChanged() {
    this.setState(Object.assign({}, this.state, {selectedTab: TabBarTab.Changes}))
  }
}
