import * as React from 'react'
import * as classNames from 'classnames'

/** The tab bar type. */
export enum TabBarType {
  /** Standard tabs */
  Tabs,

  /** Simpler switch appearance */
  Switch,
}

interface ITabBarProps {
  /** The currently selected tab. */
  readonly selectedIndex: number

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (index: number) => void

  /** The type of TabBar controlling its style */
  readonly type?: TabBarType
}

/**
 * The tab bar component.
 *
 * Set `children` to an array of JSX.Elements to represent the tab bar items.
 */
export class TabBar extends React.Component<ITabBarProps, {}> {
  private readonly tabRefsByIndex = new Map<number, HTMLButtonElement>()

  public render() {
    return (
      <div
        className={
          'tab-bar ' +
          (this.props.type === TabBarType.Switch ? 'switch' : 'tabs')
        }
        role="tablist"
      >
        {this.renderItems()}
      </div>
    )
  }

  private onSelectAdjacentTab = (
    direction: 'next' | 'previous',
    index: number
  ) => {
    const children = this.props.children as ReadonlyArray<JSX.Element> | null

    if (!children || !children.length) {
      return
    }

    const delta = direction === 'next' ? 1 : -1

    // http://javascript.about.com/od/problemsolving/a/modulobug.htm
    const nextTabIndex = (index + delta + children.length) % children.length

    const button = this.tabRefsByIndex.get(nextTabIndex)

    if (button) {
      button.focus()
    }

    this.props.onTabClicked(nextTabIndex)
  }

  private onTabClicked = (index: number) => {
    this.props.onTabClicked(index)
  }

  private onTabRef = (index: number, ref: HTMLButtonElement | null) => {
    if (!ref) {
      this.tabRefsByIndex.delete(index)
    } else {
      this.tabRefsByIndex.set(index, ref)
    }
  }

  private renderItems() {
    const children = this.props.children as ReadonlyArray<JSX.Element> | null
    if (!children) {
      return null
    }

    return children.map((child, index) => {
      const selected = index === this.props.selectedIndex
      return (
        <TabBarItem
          key={index}
          selected={selected}
          index={index}
          onClick={this.onTabClicked}
          onSelectAdjacent={this.onSelectAdjacentTab}
          onButtonRef={this.onTabRef}
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
  readonly onClick: (index: number) => void
  readonly onSelectAdjacent: (
    direction: 'next' | 'previous',
    index: number
  ) => void
  readonly onButtonRef: (
    index: number,
    button: HTMLButtonElement | null
  ) => void
}

class TabBarItem extends React.Component<ITabBarItemProps, {}> {
  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onClick(this.props.index)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      this.props.onSelectAdjacent('previous', this.props.index)
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      this.props.onSelectAdjacent('next', this.props.index)
      event.preventDefault()
    }
  }

  private onButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.props.onButtonRef(this.props.index, buttonRef)
  }

  public render() {
    const selected = this.props.selected
    const className = classNames('tab-bar-item', { selected })
    return (
      <button
        ref={this.onButtonRef}
        className={className}
        onClick={this.onClick}
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        onKeyDown={this.onKeyDown}
        type="button"
      >
        {this.props.children}
      </button>
    )
  }
}
