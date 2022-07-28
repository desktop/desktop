import * as React from 'react'
import { PullRequestSectionTab } from '../../lib/app-state'
import { TabBar } from '../tab-bar'

interface IPullRequestTabsProps {
  readonly selectedSection: PullRequestSectionTab
}

export class PullRequestTabs extends React.Component<IPullRequestTabsProps> {
  private onTabClicked = (tab: PullRequestSectionTab) => {
    console.log(tab)
  }

  public render() {
    return (
      <div className="pull-request-tabs">
        <div className="tab-container">
          <TabBar
            selectedIndex={this.props.selectedSection}
            onTabClicked={this.onTabClicked}
          >
            <span>
              <span>Files Changed</span>
            </span>

            <div>
              <span>Commits</span>
            </div>
          </TabBar>
        </div>
        <div className="after-tabs"></div>
      </div>
    )
  }
}
