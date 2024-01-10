import * as React from 'react'
import { MenuPane } from './menu-pane'
import { Dispatcher } from '../dispatcher'
import { IMenu, MenuItem, ISubmenuItem } from '../../models/app-menu'
import { SelectionSource, ClickSource } from '../lib/list'

interface IAppMenuProps {
  /**
   * A list of open menus to be rendered, each menu may have
   * a selected item.
   */
  readonly state: ReadonlyArray<IMenu>
  readonly dispatcher: Dispatcher

  /**
   * A required callback for when the app menu is closed. The menu is explicitly
   * closed when a menu item has been clicked (executed) or when the user
   * presses Escape on the top level menu pane.
   *
   * @param closeSource An object describing the action that caused the menu
   *                    to close. This can either be a keyboard event (hitting
   *                    Escape) or the user executing one of the menu items by
   *                    clicking on them or pressing enter.
   */
  readonly onClose: (closeSource: CloseSource) => void

  /**
   * Whether or not the application menu was opened with the Alt key, this
   * enables access key highlighting for applicable menu items as well as
   * keyboard navigation by pressing access keys.
   */
  readonly enableAccessKeyNavigation: boolean

  /** The id of the element that serves as the menu's accessibility label */
  readonly ariaLabelledby: string
}

export interface IKeyboardCloseSource {
  type: 'keyboard'
  event: React.KeyboardEvent<HTMLElement>
}

export interface IItemExecutedCloseSource {
  type: 'item-executed'
}

export type CloseSource = IKeyboardCloseSource | IItemExecutedCloseSource

const expandCollapseTimeout = 300

/**
 * Converts a menu pane id into something that's reasonable to use as
 * a classname by replacing forbidden characters and cleaning it
 * up in general.
 */
function menuPaneClassNameFromId(id: string) {
  const className = id
    // Get rid of the leading @. for auto-generated ids
    .replace(/^@\./, '')
    // No accelerator key modifier necessary
    .replace(/&/g, '')
    // Get rid of stuff that's not safe for css class names
    .replace(/[^a-z0-9_]+/gi, '-')
    // Get rid of redundant underscores
    .replace(/_+/, '_')
    .toLowerCase()

  return className.length ? `menu-pane-${className}` : undefined
}

export class AppMenu extends React.Component<IAppMenuProps, {}> {
  /**
   * A numeric reference to a setTimeout timer id which is used for
   * opening and closing submenus after a delay.
   *
   * See scheduleExpand and scheduleCollapse
   */
  private expandCollapseTimer: number | null = null

  private onItemClicked = (
    depth: number,
    item: MenuItem,
    source: ClickSource
  ) => {
    this.clearExpandCollapseTimer()

    if (item.type === 'submenuItem') {
      // Warning: This is a bit of a hack. When using access keys to navigate
      // to a submenu item we want it not only to expand but to have its first
      // child item selected by default. We do that by looking to see if the
      // selection source was a keyboard press and if it wasn't one of the keys
      // that we'd expect for a 'normal' click event.
      const sourceIsAccessKey =
        this.props.enableAccessKeyNavigation &&
        source.kind === 'keyboard' &&
        source.event.key !== 'Enter' &&
        source.event.key !== ' '

      this.props.dispatcher.setAppMenuState(menu =>
        menu.withOpenedMenu(item, sourceIsAccessKey)
      )
    } else if (item.type !== 'separator') {
      // Send the close event before actually executing the item so that
      // the menu can restore focus to the previously selected element
      // (if any).
      this.props.onClose({ type: 'item-executed' })
      this.props.dispatcher.executeMenuItem(item)
    }
  }

  private onPaneKeyDown = (
    depth: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    const { selectedItem } = this.props.state[depth]

    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      this.clearExpandCollapseTimer()

      // Only actually close the foldout when hitting escape
      // on the root menu
      if (depth === 0 && event.key === 'Escape') {
        this.props.onClose({ type: 'keyboard', event })
        event.preventDefault()
      } else if (depth > 0) {
        this.props.dispatcher.setAppMenuState(menu =>
          menu.withClosedMenu(this.props.state[depth])
        )

        event.preventDefault()
      }
    } else if (event.key === 'ArrowRight') {
      this.clearExpandCollapseTimer()

      // Open the submenu and select the first item
      if (selectedItem?.type === 'submenuItem') {
        this.props.dispatcher.setAppMenuState(menu =>
          menu.withOpenedMenu(selectedItem, true)
        )
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

  private onClearSelection = (depth: number) => {
    this.props.dispatcher.setAppMenuState(appMenu =>
      appMenu.withDeselectedMenu(this.props.state[depth])
    )
  }

  private onSelectionChanged = (
    depth: number,
    item: MenuItem,
    source: SelectionSource
  ) => {
    this.clearExpandCollapseTimer()

    if (source.kind === 'keyboard') {
      // Immediately close any open submenus if we're navigating by keyboard.
      this.props.dispatcher.setAppMenuState(appMenu =>
        appMenu.withSelectedItem(item).withLastMenu(this.props.state[depth])
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

  private onPaneMouseEnter = (depth: number) => {
    this.clearExpandCollapseTimer()

    const paneMenu = this.props.state[depth]
    const selectedItem = paneMenu.selectedItem

    if (selectedItem) {
      this.props.dispatcher.setAppMenuState(m =>
        m.withSelectedItem(selectedItem)
      )
    } else {
      // This ensures that the selection to this menu is reset.
      this.props.dispatcher.setAppMenuState(m => m.withDeselectedMenu(paneMenu))
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!event.defaultPrevented && event.key === 'Escape') {
      event.preventDefault()
      this.props.onClose({ type: 'keyboard', event })
    }
  }

  private renderMenuPane(depth: number, menu: IMenu): JSX.Element {
    // If the menu doesn't have an id it's the root menu
    const key = menu.id || '@'
    const className = menu.id ? menuPaneClassNameFromId(menu.id) : undefined

    return (
      <MenuPane
        key={key}
        className={className}
        depth={depth}
        items={menu.items}
        selectedItem={menu.selectedItem}
        onItemClicked={this.onItemClicked}
        onMouseEnter={this.onPaneMouseEnter}
        onKeyDown={this.onPaneKeyDown}
        onSelectionChanged={this.onSelectionChanged}
        enableAccessKeyNavigation={this.props.enableAccessKeyNavigation}
        onClearSelection={this.onClearSelection}
        ariaLabelledby={this.props.ariaLabelledby}
      />
    )
  }

  public render() {
    const menus = this.props.state
    const panes = menus.map((m, depth) => this.renderMenuPane(depth, m))

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div id="app-menu-foldout" onKeyDown={this.onKeyDown}>
        {panes}
      </div>
    )
  }

  public componentWillUnmount() {
    this.clearExpandCollapseTimer()
  }
}
