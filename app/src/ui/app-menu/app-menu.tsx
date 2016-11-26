import * as React from 'react'
import { MenuPane } from './menu-pane'
import { Dispatcher } from '../../lib/dispatcher'
import { IMenuWithSelection } from '../../lib/app-state'
import { SelectionSource } from '../list'

interface IAppMenuProps {
  readonly state: ReadonlyArray<IMenuWithSelection>
  readonly dispatcher: Dispatcher
  readonly onClose: () => void
}

export class AppMenu extends React.Component<IAppMenuProps, void> {

  /**
   * The index of the menu pane that should receive focus after the
   * next render. Default value is -1. This field is cleared after
   * each successful focus operation.
   */
  private focusPane: number = - 1

  /**
   * A mapping between pane index (depth) and actual MenuPane instances.
   * This is used in order to (indirectly) call the focus method on the
   * underlying List instances.
   *
   * See focusPane and ensurePaneFocus
   */
  private paneRefs: MenuPane[] = []

  /**
   * A numeric reference to a setTimeout timer id which is used for
   * opening and closing submenus after a delay.
   *
   * See scheduleExpand and scheduleCollapse
   */
  private expandCollapseTimer: number | null = null

  public constructor(props: IAppMenuProps) {
    super(props)
    this.focusPane = props.state.length - 1
  }

  private onItemClicked = (depth: number, item: Electron.MenuItem) => {
    if (item.type === 'submenu') {
      this.expandSubmenu(depth, item)
    } else {
      // TODO: This is where the magic should happen
    }
  }

  private onItemKeyDown = (depth: number, item: Electron.MenuItem, event: React.KeyboardEvent<any>, parentItem?: Electron.MenuItem) => {
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {

      if (depth === 0) {

        // Only actually close the whole thing when hitting escape
        if (event.key === 'Escape') {
          this.props.onClose()
        } else {
          // Close any open submenus below the current depth
          this.collapseSubmenu(depth)
        }
      } else {
        // Close any open submenus below and including the current depth
        this.collapseSubmenu(depth - 1)
      }

      this.focusPane = depth - 1
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      // Open the submenu and select the first item
      if (item.type === 'submenu') {
        const submenu = item.submenu as Electron.Menu
        this.expandSubmenu(depth, item, submenu.items[0])
        this.focusPane = depth + 1
        event.preventDefault()
      }
    }

  }

  private expandSubmenu = (depth: number, item: Electron.MenuItem, selectedItem?: Electron.MenuItem) => {
    const currentState = this.props.state
    const newState = currentState.slice(0, depth + 1)

    newState.push({
      menu: item.submenu as Electron.Menu,
      parentItem: item,
      selectedItem,
    })

    this.props.dispatcher.setAppMenuState(newState)
  }

  private collapseSubmenu = (depth: number, selectedItem?: Electron.MenuItem) => {
    const currentState = this.props.state
    const newState = currentState.slice(0, depth + 1)

    if (selectedItem) {
      newState[depth] = Object.assign({}, newState[depth], { selectedItem })
    }

    this.props.dispatcher.setAppMenuState(newState)
  }

  private clearExpandCollapseTimer() {
    if (this.expandCollapseTimer) {
      window.clearTimeout(this.expandCollapseTimer)
      this.expandCollapseTimer = null
    }
  }

  private scheduleExpand(depth: number, item: Electron.MenuItem) {
    this.clearExpandCollapseTimer()
    this.expandCollapseTimer = window.setTimeout(() => {
      this.expandSubmenu(depth, item)
    }, 500)
  }

  private scheduleCollapse(depth: number) {
    this.clearExpandCollapseTimer()
    this.expandCollapseTimer = window.setTimeout(() => {
      this.collapseSubmenu(depth)
    }, 500)
  }

  private onSelectionChanged = (depth: number, item: Electron.MenuItem, source: SelectionSource) => {
    this.clearExpandCollapseTimer()

    // Create a copy of the current state
    const newState = this.props.state.slice()

    // Update the currently active menu with the newly selected item
    newState[depth] = Object.assign({}, newState[depth], { selectedItem: item })

    if (source.kind === 'keyboard') {
      // Immediately close any open submenus if we're navigating by keyboard.
      newState.splice(depth + 1)
    } else {
      // If the newly selected item is a submenu we'll wait a bit and then expand
      // it unless the user makes another selection in between. If it's not then
      // we'll make sure to collapse any open menu below this level.
      if (item.type === 'submenu') {
        this.scheduleExpand(depth, item)
      } else {
        this.scheduleCollapse(depth)
      }
    }

    // All submenus below the active menu should have their selection cleared
    for (let i = depth + 1; i < newState.length; i++) {
      newState[i] =  Object.assign({}, newState[i], { selectedItem: undefined })
    }

    // Ensure that the path that lead us to the currently selected menu is
    // selected. i.e. all menus above the currently active menu should have
    // their selection reset to point to the currently active menu.
    for (let i = depth - 1; i >= 0; i--) {
      newState[i] =  Object.assign({}, newState[i], { selectedItem: newState[i + 1].parentItem })
    }

    this.props.dispatcher.setAppMenuState(newState)
  }

  private onMenuPaneRef = (pane: MenuPane) => {
    if (pane) {
      this.paneRefs[pane.props.depth] = pane
    }
  }

  private renderMenuPane(depth: number, menu: IMenuWithSelection): JSX.Element {
    return (
      <MenuPane
        key={depth}
        ref={this.onMenuPaneRef}
        depth={depth}
        menu={menu.menu}
        onItemClicked={this.onItemClicked}
        onItemKeyDown={this.onItemKeyDown}
        onSelectionChanged={this.onSelectionChanged}
        selectedItem={menu.selectedItem}
        parentItem={menu.parentItem}
      />
    )
  }

  public render() {

    const panes: JSX.Element[] = [ ]
    let depth = 0

    for (const menuWithSelection of this.props.state) {
      panes.push(this.renderMenuPane(depth++, menuWithSelection))
    }

    this.paneRefs = this.paneRefs.slice(0, panes.length)

    return (
      <div id='app-menu-foldout'>
        {panes}
      </div>
    )
  }

  private ensurePaneFocus() {
    if (this.focusPane >= 0) {
      const pane = this.paneRefs[this.focusPane]
      if (pane) {
        pane.focus()
        this.focusPane = -1
      }
    }
  }

  public componentDidMount() {
    this.ensurePaneFocus()
  }

  public componentDidUpdate() {
    this.ensurePaneFocus()
  }
}
