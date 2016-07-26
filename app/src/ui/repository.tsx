import * as React from 'react'

import {default as Repo} from '../models/repository'
import Toolbar from './toolbar'
import {Changes} from './changes'
import History from './history'
import ComparisonGraph from './comparison-graph'
import {TabBarTab} from './toolbar/tab-bar'
import { IHistoryState } from '../lib/app-state'
import { Dispatcher } from '../lib/dispatcher'

interface IRepositoryProps {
  repository: Repo
  history: IHistoryState
  dispatcher: Dispatcher
}

interface IRepositoryState {
  selectedTab: TabBarTab
}

export default class Repository extends React.Component<IRepositoryProps, IRepositoryState> {
  public constructor(props: IRepositoryProps) {
    super(props)

    this.state = {selectedTab: TabBarTab.Changes}
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
      return <Changes repository={this.props.repository}/>
    } else if (this.state.selectedTab === TabBarTab.History) {
      return <History repository={this.props.repository}
                      dispatcher={this.props.dispatcher}
                      history={this.props.history}/>
    } else {
      return null
    }
  }

  public render() {
    const repo = this.props.repository
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

    if (tab === TabBarTab.History) {
      this.props.dispatcher.loadHistory(this.props.repository)
    }
  }
}
