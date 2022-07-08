import * as React from 'react'
import classNames from 'classnames'

import { List, ClickSource, SelectionSource } from '../lib/list'
import {
  MenuItem,
  itemIsSelectable,
  findItemByAccessKey,
} from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'

interface IMenuPaneProps {
  /**
   * An optional classname which will be appended to the 'menu-pane' class
   */
  readonly className?: string

  /**
   * The current Menu pane depth, starts at zero and increments by one for each
   * open submenu.
   */
  readonly depth: number

  /**
   * All items available in the current menu. Note that this includes disabled
   * menu items as well as invisible ones. This list is filtered before
   * rendering.
   */
  readonly items: ReadonlyArray<MenuItem>

  /**
   * The currently selected item in the menu or undefined if no item is
   * selected.
   */
  readonly selectedItem?: MenuItem

  /**
   * A callback for when a selectable menu item was clicked by a pointer device
   * or when the Enter or Space key is pressed on a selected item. The source
   * parameter can be used to determine whether the click is a result of a
   * pointer device or keyboard.
   */
  readonly onItemClicked: (
    depth: number,
    item: MenuItem,
    source: ClickSource
  ) => void

  /**
   * A callback for when a keyboard key is pressed on a menu item. Note that
   * this only picks up on keyboard events received by a MenuItem and does
   * not cover keyboard events received on the MenuPane component itself.
   */
  readonly onItemKeyDown?: (
    depth: number,
    item: MenuItem,
    event: React.KeyboardEvent<any>
  ) => void

  /**
   * A callback for when the MenuPane selection changes (i.e. a new menu item is selected).
   */
  readonly onSelectionChanged: (
    depth: number,
    item: MenuItem,
    source: SelectionSource
  ) => void

  /** Callback for when the mouse enters the menu pane component */
  readonly onMouseEnter?: (depth: number) => void

  /**
   * Whether or not the application menu was opened with the Alt key, this
   * enables access key highlighting for applicable menu items as well as
   * keyboard navigation by pressing access keys.
   */
  readonly enableAccessKeyNavigation: boolean
}

interface IMenuPaneState {
  /**
   * A list of visible menu items that is to be rendered. This is a derivative
   * of the props items with invisible items filtered out.
   */
  readonly items: ReadonlyArray<MenuItem>

  /** The selected row index or -1 if no selection exists. */
  readonly selectedIndex: number
}

function getSelectedIndex(
  selectedItem: MenuItem | undefined,
  items: ReadonlyArray<MenuItem>
) {
  return selectedItem ? items.findIndex(i => i.id === selectedItem.id) : -1
}

/**
 * Creates a menu pane state given props. This is intentionally not
 * an instance member in order to avoid mistakenly using any other
 * input data or state than the received props.
 */
function createState(props: IMenuPaneProps): IMenuPaneState {
  const items = new Array<MenuItem>()
  const selectedItem = props.selectedItem

  let selectedIndex = -1

  // Filter out all invisible items and maintain the correct
  // selected index (if possible)
  for (let i = 0; i < props.items.length; i++) {
    const item = props.items[i]

    if (item.visible) {
      items.push(item)
      if (item === selectedItem) {
        selectedIndex = items.length - 1
      }
    }
  }

  return { items, selectedIndex }
}

export class MenuPane extends React.Component<IMenuPaneProps, IMenuPaneState> {
  private list: List | null = null

  public constructor(props: IMenuPaneProps) {
    super(props)
    this.state = createState(props)
  }

  public componentWillReceiveProps(nextProps: IMenuPaneProps) {
    // No need to recreate the filtered list if it hasn't changed,
    // we only have to update the selected item
    if (this.props.items === nextProps.items) {
      // Has the selection changed?
      if (this.props.selectedItem !== nextProps.selectedItem) {
        const selectedIndex = getSelectedIndex(
          nextProps.selectedItem,
          this.state.items
        )
        this.setState({ selectedIndex })
      }
    } else {
      this.setState(createState(nextProps))
    }
  }

  private onRowClick = (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (item.type !== 'separator' && item.enabled) {
      this.props.onItemClicked(this.props.depth, item, {
        kind: 'mouseclick',
        event,
      })
    }
  }

  private onSelectedRowChanged = (item: MenuItem, source: SelectionSource) => {
    this.props.onSelectionChanged(this.props.depth, item, source)
  }

  private onKeyDown = (event: React.KeyboardEvent<any>) => {
    if (event.defaultPrevented) {
      return
    }

    // Modifier keys are handled elsewhere, we only care about letters and symbols
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }

    // If we weren't opened with the Alt key we ignore key presses other than
    // arrow keys and Enter/Space etc.
    if (!this.props.enableAccessKeyNavigation) {
      return
    }

    // At this point the list will already have intercepted any arrow keys
    // and the list items themselves will have caught Enter/Space
    const item = findItemByAccessKey(event.key, this.state.items)
    if (item && itemIsSelectable(item)) {
      event.preventDefault()
      this.props.onSelectionChanged(this.props.depth, item, {
        kind: 'keyboard',
        event: event,
      })
      this.props.onItemClicked(this.props.depth, item, {
        kind: 'keyboard',
        event: event,
      })
    }
  }

  private onRowKeyDown = (item: MenuItem, event: React.KeyboardEvent<any>) => {
    this.props.onItemKeyDown?.(this.props.depth, item, event)
  }

  private onMouseEnter = (event: React.MouseEvent<any>) => {
    this.props.onMouseEnter?.(this.props.depth)
  }

  private onRowMouseEnter = (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (itemIsSelectable(item)) {
      this.onSelectedRowChanged(item, { kind: 'hover', event })
    }
  }

  private onRowMouseLeave = (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {}

  public render(): JSX.Element {
    const className = classNames('menu-pane', this.props.className)

    return (
      <div
        className={className}
        onMouseEnter={this.onMouseEnter}
        onKeyDown={this.onKeyDown}
      >
        {this.state.items.map((item, ix) => (
          <MenuListItem
            key={ix + item.id}
            item={item}
            highlightAccessKey={this.props.enableAccessKeyNavigation}
            selected={this.state.selectedIndex === ix}
            onKeyDown={this.onRowKeyDown}
            onMouseEnter={this.onRowMouseEnter}
            onMouseLeave={this.onRowMouseLeave}
            onClick={this.onRowClick}
          />
        ))}
      </div>
    )
  }

  public focus() {
    if (this.list) {
      this.list.focus()
    }
  }
}
