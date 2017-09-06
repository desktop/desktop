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
  /**
   * The currently selected tab's key. If a key was not provided, this will be
   * the selected tab's index.
   */
  readonly selectedKey: React.Key

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (key: React.Key) => void

  /** The type of TabBar controlling its style */
  readonly type?: TabBarType
}

/**
 * The tab bar component.
 *
 * Set `children` to an array of JSX.Elements to represent the tab bar items.
 */
export class TabBar extends React.Component<ITabBarProps, {}> {
  private readonly tabRefsByKey = new Map<React.Key, HTMLButtonElement>()

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
    key: React.Key
  ) => {
    const children = this.props.children as ReadonlyArray<JSX.Element> | null

    if (!children || !children.length) {
      return
    }

    const delta = direction === 'next' ? 1 : -1

    const index = children.findIndex((c, i) => (c.key || i) === key)

    // http://javascript.about.com/od/problemsolving/a/modulobug.htm
    const nextTabIndex = (index + delta + children.length) % children.length
    const nextChild = children[nextTabIndex]
    const nextKey = nextChild.key || nextTabIndex
    const button = this.tabRefsByKey.get(nextKey)

    if (button) {
      button.focus()
    }

    this.props.onTabClicked(nextKey)
  }

  private onTabClicked = (key: React.Key) => {
    this.props.onTabClicked(key)
  }

  private onTabRef = (key: React.Key, ref: HTMLButtonElement | null) => {
    if (!ref) {
      this.tabRefsByKey.delete(key)
    } else {
      this.tabRefsByKey.set(key, ref)
    }
  }

  private renderItems() {
    const children = this.props.children as ReadonlyArray<JSX.Element> | null
    if (!children) {
      return null
    }

    return children.map((child, index) => {
      const key = child.key || index
      const selected = key === this.props.selectedKey
      return (
        <TabBarWrapperItem
          key={key}
          childKey={key}
          selected={selected}
          onClick={this.onTabClicked}
          onSelectAdjacent={this.onSelectAdjacentTab}
          onButtonRef={this.onTabRef}
        >
          {child}
        </TabBarWrapperItem>
      )
    })
  }
}

interface ITabBarWrapperItemProps {
  readonly selected: boolean
  readonly onClick: (key: React.Key) => void
  readonly onSelectAdjacent: (
    direction: 'next' | 'previous',
    key: React.Key
  ) => void
  readonly onButtonRef: (
    key: React.Key,
    button: HTMLButtonElement | null
  ) => void
  readonly childKey: React.Key
}

class TabBarWrapperItem extends React.Component<ITabBarWrapperItemProps, {}> {
  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onClick(this.props.childKey)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      this.props.onSelectAdjacent('previous', this.props.childKey)
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      this.props.onSelectAdjacent('next', this.props.childKey)
      event.preventDefault()
    }
  }

  private onButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.props.onButtonRef(this.props.childKey, buttonRef)
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
