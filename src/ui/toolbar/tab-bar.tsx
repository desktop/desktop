import * as React from 'react'

export const enum TabBarTab {
  Changes = 0,
  History,
}

interface ITabBarProps {
  /** The currently selected tab. */
  selectedTab: TabBarTab

  /** A function which is called when a tab is clicked on. */
  onTabClicked: (tab: TabBarTab) => void
}

/** The tab bar component. */
export default class TabBar extends React.Component<ITabBarProps, void> {
  public render() {
    const changesClassName = this.props.selectedTab === TabBarTab.Changes ? 'selected' : ''
    const historyClassName = this.props.selectedTab === TabBarTab.History ? 'selected' : ''

    return (
      <div className='segmented-control'>
        <span className={'segmented-control-item ' + changesClassName}
              onClick={() => this.props.onTabClicked(TabBarTab.Changes)}>Changes</span>
        <span className={'segmented-control-item ' + historyClassName}
              onClick={() => this.props.onTabClicked(TabBarTab.History)}>History</span>
      </div>
    )
  }
}
