import * as React from 'react'
import { Repository as Repo } from '../models/repository'
import { UiView } from './ui-view'
import { Toolbar } from './toolbar'
import { Changes } from './changes'
import { History } from './history'
import { ToolbarTab } from './toolbar'
import { IRepositoryState as IRepositoryModelState, RepositorySection } from '../lib/app-state'
import { Dispatcher } from '../lib/dispatcher'

interface IRepositoryProps {
  readonly repository: Repo
  readonly state: IRepositoryModelState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
}

export class RepositoryView extends React.Component<IRepositoryProps, void> {
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
      <UiView id='repository' onKeyDown={(e) => this.onKeyDown(e)}>
        <Toolbar selectedTab={selectedTab}
                 onTabClicked={tab => this.onTabClicked(tab)}
                 hasChanges={this.props.state.changesState.workingDirectory.files.length > 0}/>
        {this.renderContent()}
      </UiView>
    )
  }

  private onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Toggle tab selection on Ctrl+Tab. Note that we don't care
    // about the shift key here, we can get away with that as long
    // as there's only two tabs.
    if (e.ctrlKey && e.key === 'Tab') {

      const section = this.props.state.selectedSection === RepositorySection.History
        ? RepositorySection.Changes
        : RepositorySection.History

      this.props.dispatcher.changeRepositorySection(this.props.repository, section)
      e.preventDefault()
    }
  }

  private onTabClicked(tab: ToolbarTab) {
    const section = tab === ToolbarTab.History ? RepositorySection.History : RepositorySection.Changes
    this.props.dispatcher.changeRepositorySection(this.props.repository, section)
  }
}
