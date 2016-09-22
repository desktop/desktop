import * as React from 'react'
import { Repository as Repo } from '../models/repository'
import { UiView } from './ui-view'
import { Toolbar } from './toolbar'
import { Changes } from './changes'
import History from './history'
import ComparisonGraph from './comparison-graph'
import { ToolbarTab } from './toolbar'
import { IRepositoryState as IRepositoryModelState, RepositorySection } from '../lib/app-state'
import { Dispatcher } from '../lib/dispatcher'

interface IRepositoryProps {
  readonly repository: Repo
  readonly state: IRepositoryModelState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
}

export default class Repository extends React.Component<IRepositoryProps, void> {
  private renderContent() {
    if (this.props.state.selectedSection === RepositorySection.Changes) {
      const branch = this.props.state.branchesState.currentBranch
      return <Changes repository={this.props.repository}
                      dispatcher={this.props.dispatcher}
                      changes={this.props.state.changesState}
                      branch={branch ? branch.name : null}
                      committerEmail={this.props.state.committerEmail}
                      gitHubUsers={this.props.state.gitHubUsers}
                      emoji={this.props.emoji}/>
    } else if (this.props.state.selectedSection === RepositorySection.History) {
      return <History repository={this.props.repository}
                      dispatcher={this.props.dispatcher}
                      history={this.props.state.historyState}
                      gitHubUsers={this.props.state.gitHubUsers}
                      emoji={this.props.emoji}
                      commits={this.props.state.commits}/>
    } else {
      return null
    }
  }

  public render() {
    const selectedTab = this.props.state.selectedSection === RepositorySection.History ? ToolbarTab.History : ToolbarTab.Changes
    return (
      <UiView id='repository'>
        <Toolbar selectedTab={selectedTab}
                 onTabClicked={tab => this.onTabClicked(tab)}
                 hasChanges={this.props.state.changesState.workingDirectory.files.length > 0}/>
        <ComparisonGraph/>
        {this.renderContent()}
      </UiView>
    )
  }

  private onTabClicked(tab: ToolbarTab) {
    const section = tab === ToolbarTab.History ? RepositorySection.History : RepositorySection.Changes
    this.props.dispatcher.changeRepositorySection(this.props.repository, section)
  }
}
