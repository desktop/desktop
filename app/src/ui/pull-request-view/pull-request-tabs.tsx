import * as React from 'react'
import { PullRequestSectionTab } from '../../lib/app-state'
import { TabBar } from '../tab-bar'

interface IPullRequestTabsProps {
  readonly selectedSection: PullRequestSectionTab

  readonly onTabClicked: (tab: PullRequestSectionTab) => void
}

export class PullRequestTabs extends React.Component<IPullRequestTabsProps> {
  public render() {
    return (
      <div className="pull-request-tabs">
        <div className="tab-container">
          <TabBar
            selectedIndex={this.props.selectedSection}
            onTabClicked={this.props.onTabClicked}
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
