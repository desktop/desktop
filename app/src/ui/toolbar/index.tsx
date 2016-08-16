import * as React from 'react'

import TabBar from '../tab-bar'

export const enum ToolbarTab {
  Changes = 0,
  History,
}

interface IToolbarProps {
  /** The currently selected tab. */
  selectedTab: ToolbarTab

  /** A function which is called when a tab is clicked on. */
  onTabClicked: (tab: ToolbarTab) => void

  /** Whether there are uncommitted changes. */
  hasChanges: boolean
}

/** The tab bar component. */
export default class Toolbar extends React.Component<IToolbarProps, void> {
  public render() {
    return (
      <div id='toolbar'>
        <TabBar selectedIndex={this.props.selectedTab} onTabClicked={index => this.props.onTabClicked(index)}>
          <span>
            <span>Changes</span>
            {this.props.hasChanges ? <span className='indicator'/> : null}
          </span>
          <span>History</span>
        </TabBar>
      </div>
    )
  }
}
