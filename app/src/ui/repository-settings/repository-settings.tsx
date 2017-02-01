import * as React from 'react'
import { TabBar } from '../tab-bar'
import { Remote } from './remote'
import { GitIgnore } from './git-ignore'
import { GitLFS } from './git-lfs'
import { assertNever } from '../../lib/fatal-error'
import { IRemote } from '../../models/remote'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'

interface IRepositorySettingsProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly remote: IRemote | null
  readonly gitIgnoreText: string | null
}

enum RepositorySettingsTab {
  Remote = 0,
  IgnoredFiles,
  GitLFS,
}

interface IRepositorySettingsState {
  readonly selectedTab: RepositorySettingsTab
}

export class RepositorySettings extends React.Component<IRepositorySettingsProps, IRepositorySettingsState> {
  public constructor(props: IRepositorySettingsProps) {
    super(props)

    this.state = { selectedTab: RepositorySettingsTab.Remote }
  }

  public render() {
    return (
      <div id='preferences'>
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedTab}>
          <span>Remote</span>
          <span>Ignored Files</span>
          <span>Git LFS</span>
        </TabBar>

        {this.renderActiveTab()}
      </div>
    )
  }

  private renderActiveTab() {
    const tab = this.state.selectedTab
    switch (tab) {
      case RepositorySettingsTab.Remote: {
        return <Remote
          remote={this.props.remote}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
        />
      }
      case RepositorySettingsTab.IgnoredFiles: {
        return <GitIgnore
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          text={this.props.gitIgnoreText}
        />
      }
      case RepositorySettingsTab.GitLFS: {
        return <GitLFS/>
      }
    }

    return assertNever(tab, `Unknown tab type: ${tab}`)
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedTab: index })
  }
}
