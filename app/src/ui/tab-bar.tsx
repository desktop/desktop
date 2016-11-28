import * as React from 'react'
import * as classNames from 'classnames'

interface ITabBarProps {
  /** The currently selected tab. */
  readonly selectedIndex: number

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (index: number) => void

  readonly children?: ReadonlyArray<JSX.Element>
}

/** The tab bar component. */
export class TabBar extends React.Component<ITabBarProps, void> {
  public render() {
    return (
      <div className='tab-bar'>
        {this.renderItems()}
      </div>
    )
  }

  private onTabClicked = (index: number) => {
    this.props.onTabClicked(index)
  }

  private renderItems() {
    const children = this.props.children as (ReadonlyArray<JSX.Element> | null)
    if (!children) { return null }

    return children.map((child, index) => {
      const selected = index === this.props.selectedIndex
      return (
        <TabBarItem
          key={index}
          selected={selected}
          index={index}
          onClick={this.onTabClicked}
        >
          {child}
        </TabBarItem>
      )
    })
  }
}

interface ITabBarItemProps {
  readonly index: number
  readonly selected: boolean
  readonly onClick: (index: number ) => void
}

class TabBarItem extends React.Component<ITabBarItemProps, void> {
  private onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    this.props.onClick(this.props.index)
  }

  public render() {
    const selected = this.props.selected
    const className = classNames('tab-bar-item', { selected })
    return (
      <div className={className} onClick={this.onClick}>
        {this.props.children}
      </div>
    )
  }
}
