import * as React from 'react'
import { MenuPane } from './menu-pane'
import { Dispatcher } from '../../lib/dispatcher'
import { IMenu, MenuItem, ISubmenuItem } from '../../models/app-menu'
import { SelectionSource } from '../list'

interface IAppMenuProps {
  readonly state: ReadonlyArray<IMenu>
  readonly dispatcher: Dispatcher
  readonly onClose: () => void
  readonly enableAccessKeyNavigation: boolean
}

const expandCollapseTimeout = 300

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

  private onItemClicked = (item: MenuItem) => {
    this.clearExpandCollapseTimer()

    if (item.type === 'submenuItem') {
      this.props.dispatcher.setAppMenuState(menu => menu.withOpenedMenu(item))
    } else if (item.type !== 'separator') {
      this.props.dispatcher.executeMenuItem(item)
      this.props.onClose()
    }
  }

  private onItemKeyDown = (depth: number, item: MenuItem, event: React.KeyboardEvent<any>) => {
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      this.clearExpandCollapseTimer()

      // Only actually close the foldout when hitting escape
      // on the root menu
      if (depth === 0 && event.key === 'Escape') {
        this.props.onClose()
      } else {
        this.props.dispatcher.setAppMenuState(menu => menu.withClosedMenu(this.props.state[depth]))
      }

      // Focus the previous menu, this might end up being -1 which is
      // okay since ensurePaneFocus will ignore negative values and in
      // this case the pane already has focus.
      this.focusPane = depth - 1
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      this.clearExpandCollapseTimer()

      // Open the submenu and select the first item
      if (item.type === 'submenuItem') {
        this.props.dispatcher.setAppMenuState(menu => menu.withOpenedMenu(item, true))
        this.focusPane = depth + 1
        event.preventDefault()
      }
    }
  }

  private clearExpandCollapseTimer() {
    if (this.expandCollapseTimer) {
      window.clearTimeout(this.expandCollapseTimer)
      this.expandCollapseTimer = null
    }
  }

  private scheduleExpand(item: ISubmenuItem) {
    this.clearExpandCollapseTimer()
    this.expandCollapseTimer = window.setTimeout(() => {
      this.props.dispatcher.setAppMenuState(menu => menu.withOpenedMenu(item))
    }, expandCollapseTimeout)
  }

  private scheduleCollapseTo(menu: IMenu) {
    this.clearExpandCollapseTimer()
    this.expandCollapseTimer = window.setTimeout(() => {
      this.props.dispatcher.setAppMenuState(am => am.withLastMenu(menu))
    }, expandCollapseTimeout)
  }

  private onSelectionChanged = (depth: number, item: MenuItem, source: SelectionSource) => {
    this.clearExpandCollapseTimer()

    if (source.kind === 'keyboard') {
      // Immediately close any open submenus if we're navigating by keyboard.
      this.props.dispatcher.setAppMenuState(appMenu => appMenu
        .withSelectedItem(item)
        .withLastMenu(this.props.state[depth])
      )
    } else {
      // If the newly selected item is a submenu we'll wait a bit and then expand
      // it unless the user makes another selection in between. If it's not then
      // we'll make sure to collapse any open menu below this level.
      if (item.type === 'submenuItem') {
        this.scheduleExpand(item)
      } else {
        this.scheduleCollapseTo(this.props.state[depth])
      }

      this.props.dispatcher.setAppMenuState(menu => menu.withSelectedItem(item))
    }
  }

  private onMenuPaneRef = (pane: MenuPane) => {
    if (pane) {
      this.paneRefs[pane.props.depth] = pane
    }
  }

  private onPaneMouseEnter = (depth: number) => {
    this.clearExpandCollapseTimer()

    const paneMenu = this.props.state[depth]
    const selectedItem = paneMenu.selectedItem

    if (selectedItem) {
      this.props.dispatcher.setAppMenuState(m => m.withSelectedItem(selectedItem))
    } else {
      // This ensures that the selection to this menu is reset.
      this.props.dispatcher.setAppMenuState(m => m.withDeselectedMenu(paneMenu))
    }

    this.focusPane = depth
  }

  private onKeyDown = (event: React.KeyboardEvent<any>) => {
    if (!event.defaultPrevented && event.key === 'Escape') {
      event.preventDefault()
      this.props.onClose()
    }
  }

  private renderMenuPane(depth: number, menu: IMenu): JSX.Element {
    return (
      <MenuPane
        key={depth}
        ref={this.onMenuPaneRef}
        depth={depth}
        items={menu.items}
        selectedItem={menu.selectedItem}
        onItemClicked={this.onItemClicked}
        onMouseEnter={this.onPaneMouseEnter}
        onItemKeyDown={this.onItemKeyDown}
        onSelectionChanged={this.onSelectionChanged}
        enableAccessKeyNavigation={this.props.enableAccessKeyNavigation}
      />
    )
  }

  public render() {

    const menus = this.props.state
    const panes = menus.map((m, depth) => this.renderMenuPane(depth, m))

    // Clear out any old references we might have to panes that are
    // no longer displayed.
    this.paneRefs = this.paneRefs.slice(0, panes.length)

    return (
      <div id='app-menu-foldout' onKeyDown={this.onKeyDown}>
        {panes}
      </div>
    )
  }

  /**
   * Called after mounting or re-rendering and ensures that the
   * appropriate (if any) MenuPane list receives keyboard focus.
   */
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

  public componentWillUnmount() {
    this.clearExpandCollapseTimer()
  }
}
