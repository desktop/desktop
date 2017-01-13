import * as React from 'react'
import { TabBar } from '../tab-bar'

interface IRepositorySettingsProps {

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

  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedTab: index })
  }
}
