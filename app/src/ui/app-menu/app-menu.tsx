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

  /**
   * Whether the menu was opened by pressing Alt (or Alt+X where X is an
   * access key for one of the top level menu items). This is used as a
   * one-time signal to the AppMenu to use some special semantics for
   * selection and focus. Specifically it will ensure that the last opened
   * menu will receive focus.
   */
  readonly openedWithAccessKey: boolean

  /**
   * If true the MenuPane only takes up as much vertical space needed to
   * show all menu items. This does not affect maximum height, i.e. if the
   * visible menu items takes up more space than what is available the menu
   * will still overflow and be scrollable.
   *
   * @default false
   */
  readonly autoHeight?: boolean
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
    .replace('&', '')
    // Get rid of stuff that's not safe for css class names
    .replace(/[^a-z0-9_]+/gi, '-')
    // Get rid of redundant underscores
    .replace(/_+/, '_')
    .toLowerCase()

  return className.length ? `menu-pane-${className}` : undefined
}

export class AppMenu extends React.Component<IAppMenuProps, {}> {
  /**
   * The index of the menu pane that should receive focus after the
   * next render. Default value is -1. This field is cleared after
   * each successful focus operation.
   */
  private focusPane: number = -1

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
    this.receiveProps(null, props)
  }

  private receiveProps(
    currentProps: IAppMenuProps | null,
    nextProps: IAppMenuProps
  ) {
    if (nextProps.openedWithAccessKey) {
      // We only want to react to the openedWithAccessKey prop once, either
      // when it goes from false to true or when we receive it as our first
      // prop. By doing it this way we save ourselves having to go through
      // the dispatcher and updating the value once we've received it.
      if (!currentProps || !currentProps.openedWithAccessKey) {
        // Since we were opened with an access key we auto set focus to the
        // last pane opened.
        this.focusPane = nextProps.state.length - 1
      }
    }
  }

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
        (source.event.key !== 'Enter' && source.event.key !== ' ')

      this.props.dispatcher.setAppMenuState(menu =>
        menu.withOpenedMenu(item, sourceIsAccessKey)
      )
      if (source.kind === 'keyboard') {
        this.focusPane = depth + 1
      }
    } else if (item.type !== 'separator') {
      // Send the close event before actually executing the item so that
      // the menu can restore focus to the previously selected element
      // (if any).
      this.props.onClose({ type: 'item-executed' })
      this.props.dispatcher.executeMenuItem(item)
    }
  }

  private onItemKeyDown = (
    depth: number,
    item: MenuItem,
    event: React.KeyboardEvent<any>
  ) => {
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

        this.focusPane = depth - 1
        event.preventDefault()
      }
    } else if (event.key === 'ArrowRight') {
      this.clearExpandCollapseTimer()

      // Open the submenu and select the first item
      if (item.type === 'submenuItem') {
        this.props.dispatcher.setAppMenuState(menu =>
          menu.withOpenedMenu(item, true)
        )
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

  private onMenuPaneRef = (pane: MenuPane | null) => {
    if (pane) {
      this.paneRefs[pane.props.depth] = pane
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

    this.focusPane = depth
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!event.defaultPrevented && event.key === 'Escape') {
      event.preventDefault()
      this.props.onClose({ type: 'keyboard', event })
    }
  }

  private renderMenuPane(depth: number, menu: IMenu): JSX.Element {
    // NB: We use the menu id instead of depth as the key here to force
    // a new MenuPane instance and List. This is because we used dynamic
    // row heights and the react-virtualized Grid component isn't able to
    // recompute row heights accurately. Without this row indices which
    // previously held a separator item will retain that height and vice-
    // versa.
    // If the menu doesn't have an id it's the root menu
    const key = menu.id || '@'
    const className = menu.id ? menuPaneClassNameFromId(menu.id) : undefined

    return (
      <MenuPane
        key={key}
        ref={this.onMenuPaneRef}
        className={className}
        autoHeight={this.props.autoHeight}
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
      <div id="app-menu-foldout" onKeyDown={this.onKeyDown}>
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

  public componentWillReceiveProps(nextProps: IAppMenuProps) {
    this.receiveProps(this.props, nextProps)
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
