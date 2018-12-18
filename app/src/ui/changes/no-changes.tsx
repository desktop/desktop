import * as React from 'react'
import * as classNames from 'classnames'

import { encodePathAsUrl } from '../../lib/path'
import { revealInFileManager } from '../../lib/app-shell'
import { Repository } from '../../models/repository'
import { LinkButton } from '../lib/link-button'
import { enableNewNoChangesBlankslate } from '../../lib/feature-flag'
import { MenuIDs } from '../../main-process/menu'
import { IMenu, MenuItem } from '../../models/app-menu'
import memoizeOne from 'memoize-one'
import { getPlatformSpecificNameOrSymbolForModifier } from '../../lib/menu-item'
import { MenuBackedBlankslateAction } from './menu-backed-blankslate-action'

const BlankSlateImage = encodePathAsUrl(
  __dirname,
  'static/empty-no-file-selected.svg'
)

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

interface INoChangesProps {
  readonly repository: Repository

  /**
   * The top-level application menu item.
   */
  readonly appMenu: IMenu | undefined
}

interface IMenuItemInfo {
  readonly label: string
  readonly acceleratorKeys: ReadonlyArray<string>
  readonly parentMenuLabels: ReadonlyArray<string>
  readonly enabled: boolean
}

function getItemAcceleratorKeys(item: MenuItem) {
  if (item.type === 'separator' || item.type === 'submenuItem') {
    return []
  }

  if (item.accelerator === null) {
    return []
  }

  return item.accelerator
    .split('+')
    .map(getPlatformSpecificNameOrSymbolForModifier)
}

function buildMenuItemInfoMap(
  menu: IMenu,
  map = new Map<string, IMenuItemInfo>(),
  parent?: IMenuItemInfo
): ReadonlyMap<string, IMenuItemInfo> {
  for (const item of menu.items) {
    if (item.type === 'separator') {
      continue
    }

    const infoItem: IMenuItemInfo = {
      label: item.label,
      acceleratorKeys: getItemAcceleratorKeys(item),
      parentMenuLabels:
        parent === undefined ? [] : [parent.label, ...parent.parentMenuLabels],
      enabled: item.enabled,
    }

    map.set(item.id, infoItem)

    if (item.type === 'submenuItem') {
      buildMenuItemInfoMap(item.menu, map, infoItem)
    }
  }

  return map
}

/** The component to display when there are no local changes. */
export class NoChanges extends React.Component<INoChangesProps, {}> {
  private getMenuInfoMap = memoizeOne((menu: IMenu | undefined) =>
    menu === undefined
      ? new Map<string, IMenuItemInfo>()
      : buildMenuItemInfoMap(menu)
  )

  private getMenuItemInfo(menuItemId: MenuIDs): IMenuItemInfo | undefined {
    return this.getMenuInfoMap(this.props.appMenu).get(menuItemId)
  }

  private renderClassicBlankSlate() {
    const opener = __DARWIN__
      ? 'Finder'
      : __WIN32__
      ? 'Explorer'
      : 'your File Manager'
    return (
      <div className="panel blankslate" id="no-changes">
        <img src={BlankSlateImage} className="blankslate-image" />
        <div>No local changes</div>

        <div>
          Would you like to{' '}
          <LinkButton onClick={this.open}>open this repository</LinkButton> in{' '}
          {opener}?
        </div>
      </div>
    )
  }

  private renderNewNoChangesBlankSlate() {
    const className = classNames({
      // This is unneccessary but serves as a reminder to drop
      // the ng class from here and change the scss when we
      // remove the feature flag.
      ng: enableNewNoChangesBlankslate(),
    })

    return (
      <div id="no-changes" className={className}>
        <div className="content">
          <div className="header">
            <div className="text">
              <h1>No local changes</h1>
              <p>
                You have no uncommitted changes in your repository! Here’s some
                friendly suggestions for what to do next.
              </p>
            </div>
            <img src={PaperStackImage} className="blankslate-image" />
          </div>
          {this.renderActions()}
        </div>
      </div>
    )
  }

  private getPlatformFileManagerName() {
    if (__DARWIN__) {
      return 'Finder'
    } else if (__WIN32__) {
      return 'Explorer'
    }
    return 'Your File Manager'
  }

  private renderDiscoverabilityElements(menuItem: IMenuItemInfo) {
    const parentMenusText = menuItem.parentMenuLabels.join(' -> ')
    const keyboardShortcut = menuItem.acceleratorKeys.map((k, i) => (
      <kbd key={k + i}>{k}</kbd>
    ))

    return (
      <>
        {parentMenusText} menu or {keyboardShortcut}
      </>
    )
  }

  private renderMenuBackedAction(itemId: MenuIDs, title: string) {
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    if (!menuItem.enabled) {
      return null
    }

    return (
      <MenuBackedBlankslateAction
        title={title}
        description={this.renderDiscoverabilityElements(menuItem)}
        menuItemId={itemId}
        buttonText={menuItem.label}
      />
    )
  }

  private renderShowInFinderAction() {
    const fileManager = this.getPlatformFileManagerName()

    return this.renderMenuBackedAction(
      'open-working-directory',
      `View the files in your repository in ${fileManager}`
    )
  }

  private renderViewOnGitHub() {
    return this.renderMenuBackedAction(
      'view-repository-on-github',
      `Open the repository page on GitHub in your browser`
    )
  }

  private renderActions() {
    return (
      <div className="actions">
        {this.renderShowInFinderAction()}
        {this.renderViewOnGitHub()}
      </div>
    )
  }

  public render() {
    if (enableNewNoChangesBlankslate()) {
      return this.renderNewNoChangesBlankSlate()
    }

    return this.renderClassicBlankSlate()
  }

  private open = () => {
    revealInFileManager(this.props.repository, '')
  }
}
