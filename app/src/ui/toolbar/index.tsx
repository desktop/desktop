import * as React from 'react'

import { TabBar, TabBarItem } from '../tab-bar'

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

// Unforunately there's no way to instantiate a generic JSX component in JSX. So
// we have to create these explicit instantiations to make everything happy. See
// https://github.com/Microsoft/TypeScript/issues/6395.
const ToolbarTabBar = TabBar as new () => TabBar<ToolbarTab>
const ToolbarTabBarItem = TabBarItem as new () => TabBarItem<ToolbarTab>

/** The tab bar component. */
export default class Toolbar extends React.Component<IToolbarProps, void> {
  public render() {
    return (
      <div id='toolbar'>
        <ToolbarTabBar selectedValue={this.props.selectedTab} onTabClicked={value => this.props.onTabClicked(value)}>
          <ToolbarTabBarItem value={ToolbarTab.Changes}>
            <span>Changes</span>
            {this.props.hasChanges ? <span className='indicator'/> : null}
          </ToolbarTabBarItem>
          <ToolbarTabBarItem value={ToolbarTab.History}>
            <span>History</span>
          </ToolbarTabBarItem>
        </ToolbarTabBar>
      </div>
    )
  }
}
