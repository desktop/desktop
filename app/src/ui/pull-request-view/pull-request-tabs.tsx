import * as React from 'react'
import { PullRequestSectionTab } from '../../lib/app-state'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { TabBar } from '../tab-bar'

interface IPullRequestTabsProps {
  readonly selectedSection: PullRequestSectionTab
  readonly filesChangedCount: number
  readonly commitsCount: number

  readonly onTabClicked: (tab: PullRequestSectionTab) => void
}

export class PullRequestTabs extends React.Component<IPullRequestTabsProps> {
  public render() {
    return (
      <div className="pull-request-tabs">
        <TabBar
          selectedIndex={this.props.selectedSection}
          onTabClicked={this.props.onTabClicked}
        >
          <div>
            <Octicon symbol={OcticonSymbol.fileDiff} />
            <span>{this.props.filesChangedCount} Files Changed</span>
          </div>

          <div>
            <Octicon symbol={OcticonSymbol.gitCommit} />
            <span>{this.props.commitsCount} Commits</span>
          </div>
        </TabBar>
      </div>
    )
  }
}
