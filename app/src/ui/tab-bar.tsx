import * as React from 'react'

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

  private renderItems() {
    const children = this.props.children as (ReadonlyArray<JSX.Element> | null)
    if (!children) { return null }

    return children.map((child, index) => {
      const selected = index === this.props.selectedIndex
      const className = selected ? 'selected' : ''
      return (
        <div key={index}
              className={'tab-bar-item ' + className}
              onClick={() => this.props.onTabClicked(index)}>
          {child}
        </div>
      )
    })
  }
}
