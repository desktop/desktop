import * as React from 'react'
import classNames from 'classnames'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'

/** Time to wait for drag element hover before switching tabs */
const dragTabSwitchWaitTime = 500

/** The tab bar type. */
export enum TabBarType {
  /** Standard tabs */
  Tabs,

  /** Simpler switch appearance */
  Switch,

  /** Vertical tabs */
  Vertical,
}

interface ITabBarProps {
  /** The currently selected tab. */
  readonly selectedIndex: number

  /** A function which is called when a tab is clicked on. */
  readonly onTabClicked: (index: number) => void

  /** The type of TabBar controlling its style */
  readonly type?: TabBarType

  /** Navigate via drag over */
  readonly allowDragOverSwitching?: boolean
}

/**
 * The tab bar component.
 *
 * Set `children` to an array of JSX.Elements to represent the tab bar items.
 */
export class TabBar extends React.Component<ITabBarProps, {}> {
  private readonly tabRefsByIndex = new Map<number, HTMLButtonElement>()
  private mouseOverTimeoutId: number | null = null

  public render() {
    const { type } = this.props

    return (
      <div
        className={
          'tab-bar ' +
          (type === TabBarType.Switch
            ? 'switch'
            : type === TabBarType.Vertical
            ? 'vertical'
            : 'tabs')
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
    const children = React.Children.toArray(this.props.children)

    if (children.length === 0) {
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

  /**
   * If something is being dragged, this allows for tab selection by hovering
   * over a tab for a few seconds (dragTabSwitchWaitTime)
   */
  private onMouseEnter = (index: number) => {
    if (
      index === this.props.selectedIndex ||
      !dragAndDropManager.isDragInProgress ||
      this.props.allowDragOverSwitching === undefined ||
      !this.props.allowDragOverSwitching
    ) {
      return
    }

    this.mouseOverTimeoutId = window.setTimeout(() => {
      this.onTabClicked(index)
    }, dragTabSwitchWaitTime)
  }

  private onMouseLeave = () => {
    if (this.mouseOverTimeoutId !== null) {
      window.clearTimeout(this.mouseOverTimeoutId)
    }
  }

  private renderItems() {
    const children = React.Children.toArray(this.props.children)

    return children.map((child, index) => {
      const selected = index === this.props.selectedIndex
      return (
        <TabBarItem
          key={index}
          selected={selected}
          index={index}
          onClick={this.onTabClicked}
          onMouseEnter={this.onMouseEnter}
          onMouseLeave={this.onMouseLeave}
          onSelectAdjacent={this.onSelectAdjacentTab}
          onButtonRef={this.onTabRef}
          type={this.props.type}
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
  readonly onMouseEnter: (index: number) => void
  readonly onMouseLeave: () => void
  readonly onSelectAdjacent: (
    direction: 'next' | 'previous',
    index: number
  ) => void
  readonly onButtonRef: (
    index: number,
    button: HTMLButtonElement | null
  ) => void
  readonly type?: TabBarType
}

class TabBarItem extends React.Component<ITabBarItemProps, {}> {
  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onClick(this.props.index)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { type, index } = this.props
    const previousKey = type === TabBarType.Vertical ? 'ArrowUp' : 'ArrowLeft'
    const nextKey = type === TabBarType.Vertical ? 'ArrowDown' : 'ArrowRight'
    if (event.key === previousKey) {
      this.props.onSelectAdjacent('previous', index)
      event.preventDefault()
    } else if (event.key === nextKey) {
      this.props.onSelectAdjacent('next', index)
      event.preventDefault()
    }
  }

  private onButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.props.onButtonRef(this.props.index, buttonRef)
  }

  private onMouseEnter = () => {
    this.props.onMouseEnter(this.props.index)
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
        tabIndex={selected ? undefined : -1}
        onKeyDown={this.onKeyDown}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.props.onMouseLeave}
        type="button"
      >
        {this.props.children}
      </button>
    )
  }
}
