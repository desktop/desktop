import * as React from 'react'
import TabBar, { TabBarTab } from './tab-bar'

interface IToolbarProps {
  /** The currently selected tab. */
  selectedTab: TabBarTab

  /** A function which is called when a tab is clicked on. */
  onTabClicked: (tab: TabBarTab) => void
}

/** The toolbar at the top of the window. */
export default class Toolbar extends React.Component<IToolbarProps, void> {
  public render() {
    return (
      <div id='toolbar'>
        <TabBar selectedTab={this.props.selectedTab} onTabClicked={this.props.onTabClicked}/>
      </div>
    )
  }
}
