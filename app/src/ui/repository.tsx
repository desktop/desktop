import * as React from 'react'
import { Repository as Repo } from '../models/repository'
import { UiView } from './ui-view'
import { Changes } from './changes'
import { History } from './history'
import { TabBar } from './tab-bar'
import { IRepositoryState as IRepositoryModelState, RepositorySection } from '../lib/app-state'
import { Dispatcher } from '../lib/dispatcher'

interface IRepositoryProps {
  readonly repository: Repo
  readonly state: IRepositoryModelState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
}

const enum Tab {
  Changes = 0,
  History = 1,
}

export class RepositoryView extends React.Component<IRepositoryProps, void> {

  private renderTabs() {
    const hasChanges = this.props.state.changesState.workingDirectory.files.length > 0
    const selectedTab = this.props.state.selectedSection === RepositorySection.Changes
      ? Tab.Changes
      : Tab.History

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={index => this.onTabClicked(index)}>
        <span>
          <span>Changes</span>
          {hasChanges ? <span className='indicator'/> : null}
        </span>
        <span>History</span>
      </TabBar>
    )
  }

  private renderContent() {
    if (this.props.state.selectedSection === RepositorySection.Changes) {
      const branch = this.props.state.branchesState.currentBranch
      const localCommitSHAs = this.props.state.localCommitSHAs
      const mostRecentLocalCommitSHA = localCommitSHAs.length > 0 ? localCommitSHAs[0] : null
      const mostRecentLocalCommit = (mostRecentLocalCommitSHA ? this.props.state.commits.get(mostRecentLocalCommitSHA) : null) || null

      return <Changes repository={this.props.repository}
                      dispatcher={this.props.dispatcher}
                      changes={this.props.state.changesState}
                      branch={branch ? branch.name : null}
                      commitAuthor={this.props.state.commitAuthor}
                      gitHubUsers={this.props.state.gitHubUsers}
                      emoji={this.props.emoji}
                      mostRecentLocalCommit={mostRecentLocalCommit}/>
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
    return (
      <UiView id='repository' onKeyDown={(e) => this.onKeyDown(e)}>
        {this.renderTabs()}
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

  private onTabClicked(tab: Tab) {
    const section = tab === Tab.History ? RepositorySection.History : RepositorySection.Changes
    this.props.dispatcher.changeRepositorySection(this.props.repository, section)
  }
}
