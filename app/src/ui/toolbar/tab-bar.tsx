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

  /** Whether there are uncommitted changes. */
  hasChanges: boolean
}

/** The tab bar component. */
export default class TabBar extends React.Component<ITabBarProps, void> {
  public render() {
    return (
      <div className='segmented-control'>
        <TabBarItem title='Changes'
                    selected={this.props.selectedTab === TabBarTab.Changes}
                    onClick={() => this.props.onTabClicked(TabBarTab.Changes)}
                    showIndicator={this.props.hasChanges}/>
        <TabBarItem title='History'
                    selected={this.props.selectedTab === TabBarTab.History}
                    onClick={() => this.props.onTabClicked(TabBarTab.History)}
                    showIndicator={false}/>
      </div>
    )
  }
}

interface ITabBarItemProps {
  title: string
  selected: boolean
  onClick: () => void
  showIndicator: boolean
}

function TabBarItem({ title, selected, onClick, showIndicator }: ITabBarItemProps) {
  const className = selected ? 'selected' : ''
  return (
    <span className={'segmented-control-item ' + className}
         onClick={onClick}>
      <span>{title}</span>
      {showIndicator ? <span className='indicator'/> : null}
    </span>
  )
}
