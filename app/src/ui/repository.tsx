import * as React from 'react'
import { default as Repo } from '../models/repository'
import Toolbar from './toolbar'
import { Changes } from './changes'
import History from './history'
import ComparisonGraph from './comparison-graph'
import { TabBarTab } from './toolbar/tab-bar'
import { IRepositoryState as IRepositoryModelState, RepositorySection } from '../lib/app-state'
import { Dispatcher, GitUserStore } from '../lib/dispatcher'

interface IRepositoryProps {
  readonly repository: Repo | null
  readonly state: IRepositoryModelState
  readonly dispatcher: Dispatcher
  readonly gitUserStore: GitUserStore
}

export default class Repository extends React.Component<IRepositoryProps, void> {
  private renderNoSelection() {
    return (
      <div className='blankslate'>
        No repo selected!
      </div>
    )
  }

  private renderContent() {
    if (this.props.state.selectedSection === RepositorySection.Changes) {
      return <Changes repository={this.props.repository!}
                      dispatcher={this.props.dispatcher}
                      changes={this.props.state.changesState}
                      branch={this.props.state.branch}/>
    } else if (this.props.state.selectedSection === RepositorySection.History) {
      return <History repository={this.props.repository!}
                      dispatcher={this.props.dispatcher}
                      history={this.props.state.historyState}
                      gitUserStore={this.props.gitUserStore}/>
    } else {
      return null
    }
  }

  public render() {
    const repo = this.props.repository
    if (!repo) {
      return this.renderNoSelection()
    }

    const selectedTab = this.props.state.selectedSection === RepositorySection.History ? TabBarTab.History : TabBarTab.Changes
    return (
      <div id='repository'>
        <Toolbar selectedTab={selectedTab}
                 onTabClicked={tab => this.onTabClicked(tab)}
                 hasChanges={this.props.state.changesState.workingDirectory.files.length > 0}/>
        <ComparisonGraph/>
        {this.renderContent()}
      </div>
    )
  }

  private onTabClicked(tab: TabBarTab) {
    const section = tab === TabBarTab.History ? RepositorySection.History : RepositorySection.Changes
    this.props.dispatcher.changeRepositorySection(this.props.repository!, section)
  }
}
