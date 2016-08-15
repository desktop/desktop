import * as React from 'react'

interface ITabBarProps<ValueType> {
  /** The currently selected tab. */
  readonly selectedValue: ValueType

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (value: ValueType) => void

  readonly children?: ReadonlyArray<TabBarItem<ValueType>>
}

/** The tab bar component. */
export class TabBar<ValueType> extends React.Component<ITabBarProps<ValueType>, void> {
  public render() {
    return (
      <div className='tab-bar'>
        {this.renderItems()}
      </div>
    )
  }

  private renderItems() {
    const children = this.props.children as (ReadonlyArray<TabBarItem<ValueType>> | null)
    if (!children) { return null }

    return children.map((child, index) => {
      const value = child.props.value
      const selected = child.props.value === this.props.selectedValue
      const className = selected ? 'selected' : ''
      return (
        <span key={index}
              className={'tab-bar-item ' + className}
              onClick={() => this.props.onTabClicked(value)}>
          {child}
        </span>
      )
    })
  }
}

interface ITabBarItemProps<ValueType> {
  readonly value: ValueType
  readonly children?: ReadonlyArray<JSX.Element>
}

export class TabBarItem<ValueType> extends React.Component<ITabBarItemProps<ValueType>, void> {
  public render() {
    return <span>{this.props.children}</span>
  }
}
