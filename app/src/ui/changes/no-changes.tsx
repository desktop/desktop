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
import { executeMenuItemById } from '../main-process-proxy'
import { IRepositoryState } from '../../lib/app-state'
import { TipState } from '../../models/tip'
import { Ref } from '../lib/ref'
import { IAheadBehind } from '../../models/branch'
import { IRemote } from '../../models/remote'

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

  /**
   * An object describing the current state of
   * the selected repository. Used to determine
   * whether to render push, pull, publish, or
   * 'open pr' actions.
   */
  readonly repositoryState: IRepositoryState
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
                You have no uncommitted changes in your repository! Here are
                some friendly suggestions for what to do next.
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

    return (
      <>
        {parentMenusText} menu or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )
  }

  private renderDiscoverabilityKeyboardShortcut(menuItem: IMenuItemInfo) {
    return menuItem.acceleratorKeys.map((k, i) => <kbd key={k + i}>{k}</kbd>)
  }

  private renderMenuBackedAction(
    itemId: MenuIDs,
    title: string,
    description?: string | JSX.Element
  ) {
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
        description={description}
        discoverabilityContent={this.renderDiscoverabilityElements(menuItem)}
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

  private openPreferences = () => {
    executeMenuItemById('preferences')
  }

  private renderOpenInExternalEditor() {
    const itemId: MenuIDs = 'open-external-editor'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const preferencesMenuItem = this.getMenuItemInfo('preferences')

    if (preferencesMenuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const title = `Open the repository in your external editor`

    const description = (
      <>
        Configure which editor you wish to use in{' '}
        <LinkButton onClick={this.openPreferences}>
          {__DARWIN__ ? 'preferences' : 'options'}
        </LinkButton>
      </>
    )

    return this.renderMenuBackedAction(itemId, title, description)
  }

  private renderRemoteAction() {
    const { remote, aheadBehind } = this.props.repositoryState

    if (remote === null) {
      return this.renderPublishRepositoryAction()
    }

    // Branch not published
    if (aheadBehind === null) {
      return this.renderPublishBranchAction()
    }

    if (aheadBehind.behind > 0) {
      return this.renderPullBranchAction(remote, aheadBehind)
    }

    return null
  }

  private renderPublishRepositoryAction() {
    // This is a bit confusing, there's no dedicated
    // publish menu item, the 'Push' menu item will initiate
    // a publish if the repository doesn't have a remote. We'll
    // use it here for the keyboard shortcut only.
    const itemId: MenuIDs = 'push'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const discoverabilityContent = (
      <>
        Always available in the toolbar for local repositories or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    return (
      <MenuBackedBlankslateAction
        title="Publish your repository to GitHub"
        description="This repository is currently only available on your local machine. By publishing it on GitHub you can share it, and collaborate with others."
        discoverabilityContent={discoverabilityContent}
        buttonText="Publish repository"
        menuItemId={itemId}
        type="primary"
      />
    )
  }

  private renderPublishBranchAction() {
    // This is a bit confusing, there's no dedicated
    // publish branch menu item, the 'Push' menu item will initiate
    // a publish if the branch doesn't have a remote tracking branch.
    // We'll use it here for the keyboard shortcut only.
    const itemId: MenuIDs = 'push'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const { branchesState } = this.props.repositoryState
    const { tip } = branchesState

    const isGitHub = this.props.repository.gitHubRepository !== null

    if (tip.kind !== TipState.Valid) {
      return null
    }

    const description = (
      <>
        The branch you're currently on (<Ref>{tip.branch.name}</Ref>) hasn't
        been published to the remote yet. By publishing it{' '}
        {isGitHub ? 'to GitHub' : ''} you can share it,{' '}
        {isGitHub ? 'open a pull request, ' : ''}
        and collaborate with others.
      </>
    )

    const discoverabilityContent = (
      <>
        Always available in the toolbar or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    return (
      <MenuBackedBlankslateAction
        title="Publish your branch"
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText="Publish branch"
        type="primary"
      />
    )
  }

  private renderPullBranchAction(remote: IRemote, aheadBehind: IAheadBehind) {
    const itemId: MenuIDs = 'pull'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const { branchesState } = this.props.repositoryState
    const { tip } = branchesState

    const isGitHub = this.props.repository.gitHubRepository !== null

    if (tip.kind !== TipState.Valid) {
      return null
    }

    const description = (
      <>
        The current branch (<Ref>{tip.branch.name}</Ref>) has commits on{' '}
        {isGitHub ? 'GitHub' : 'the remote'} that doesn’t exist on your machine.
      </>
    )

    const discoverabilityContent = (
      <>
        Always available in the toolbar when there are remote changes or{' '}
        {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    const title = `Pull ${aheadBehind.behind} ${
      aheadBehind.behind === 1 ? 'commit' : 'commits'
    } from the ${remote.name} remote`

    const buttonText = `Pull ${remote.name}`

    return (
      <MenuBackedBlankslateAction
        title={title}
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText={buttonText}
        type="primary"
      />
    )
  }

  private renderActions() {
    const remoteAction = this.renderRemoteAction()
    const remoteActions =
      remoteAction === null || remoteAction === undefined ? null : (
        <div className="actions primary">{remoteAction}</div>
      )

    return (
      <>
        {remoteActions}
        <div className="actions">
          {this.renderShowInFinderAction()}
          {this.renderOpenInExternalEditor()}
          {this.renderViewOnGitHub()}
        </div>
      </>
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
