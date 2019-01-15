import * as React from 'react'
import * as ReactCSSTransitionReplace from 'react-css-transition-replace'

import { encodePathAsUrl } from '../../lib/path'
import { Repository } from '../../models/repository'
import { LinkButton } from '../lib/link-button'
import { MenuIDs } from '../../main-process/menu'
import { IMenu, MenuItem } from '../../models/app-menu'
import memoizeOne from 'memoize-one'
import { getPlatformSpecificNameOrSymbolForModifier } from '../../lib/menu-item'
import { MenuBackedBlankslateAction } from './menu-backed-blankslate-action'
import { executeMenuItemById } from '../main-process-proxy'
import { IRepositoryState } from '../../lib/app-state'
import { TipState, IValidBranch } from '../../models/tip'
import { Ref } from '../lib/ref'
import { IAheadBehind } from '../../models/branch'
import { IRemote } from '../../models/remote'

function formatMenuItemLabel(text: string) {
  if (__WIN32__ || __LINUX__) {
    return text.replace('&', '')
  }

  return text
}

function formatParentMenuLabel(menuItem: IMenuItemInfo) {
  const parentMenusText = menuItem.parentMenuLabels.join(' -> ')
  return formatMenuItemLabel(parentMenusText)
}

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

interface INoChangesProps {
  /**
   * The currently selected repository
   */
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

  /**
   * Whether or not the user has a configured (explicitly,
   * or automatically) external editor. Used to
   * determine whether or not to render the action for
   * opening the repository in an external editor.
   */
  readonly isExternalEditorAvailable: boolean
}

/**
 * Helper projection interface used to hold
 * computed information about a particular menu item.
 * Used internally in the NoChanges component to
 * trace whether a menu item is enabled, what its
 * keyboard shortcut is and so forth.
 */
interface IMenuItemInfo {
  /**
   * The textual representation of the menu item,
   * this is what's shown in the application menu
   */
  readonly label: string

  /**
   * Any accelerator keys (i.e. keyboard shortcut)
   * for the menu item. A menu item which can be
   * triggered using Command+Shift+K would be
   * represented here as three elements in the
   * array. Used to format and display the keyboard
   * shortcut for activating an action.
   */
  readonly acceleratorKeys: ReadonlyArray<string>

  /**
   * An ordered list of the labels for parent menus
   * of a particular menu item. Used to provide
   * a textual representation of where to locate
   * a particular action in the menu system.
   */
  readonly parentMenuLabels: ReadonlyArray<string>

  /**
   * Whether or not the menu item is currently
   * enabled.
   */
  readonly enabled: boolean
}

interface INoChangesState {
  /**
   * Whether or not to enable the slide in and
   * slide out transitions for the remote actions.
   *
   * Disabled initially and enabled 500ms after
   * component mounting in order to provide instant
   * loading of the remote action when the view is
   * initially appearing.
   */
  readonly enableTransitions: boolean
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
export class NoChanges extends React.Component<
  INoChangesProps,
  INoChangesState
> {
  private getMenuInfoMap = memoizeOne((menu: IMenu | undefined) =>
    menu === undefined
      ? new Map<string, IMenuItemInfo>()
      : buildMenuItemInfoMap(menu)
  )

  /**
   * ID for the timer that's activated when the component
   * mounts. See componentDidMount/componenWillUnmount.
   */
  private transitionTimer: number | null = null

  public constructor(props: INoChangesProps) {
    super(props)
    this.state = {
      enableTransitions: false,
    }
  }

  private getMenuItemInfo(menuItemId: MenuIDs): IMenuItemInfo | undefined {
    return this.getMenuInfoMap(this.props.appMenu).get(menuItemId)
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
    const parentMenusText = formatParentMenuLabel(menuItem)

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

    return (
      <MenuBackedBlankslateAction
        title={title}
        description={description}
        discoverabilityContent={this.renderDiscoverabilityElements(menuItem)}
        menuItemId={itemId}
        buttonText={formatMenuItemLabel(menuItem.label)}
        disabled={!menuItem.enabled}
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
    const isGitHub = this.props.repository.gitHubRepository !== null

    if (!isGitHub) {
      return null
    }

    return this.renderMenuBackedAction(
      'view-repository-on-github',
      `Open the repository page on GitHub in your browser`
    )
  }

  private openPreferences = () => {
    executeMenuItemById('preferences')
  }

  private renderOpenInExternalEditor() {
    if (!this.props.isExternalEditorAvailable) {
      return null
    }

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
    const { remote, aheadBehind, branchesState } = this.props.repositoryState
    const { tip, defaultBranch, currentPullRequest } = branchesState

    if (tip.kind !== TipState.Valid) {
      return null
    }

    if (remote === null) {
      return this.renderPublishRepositoryAction()
    }

    // Branch not published
    if (aheadBehind === null) {
      return this.renderPublishBranchAction(tip)
    }

    if (aheadBehind.behind > 0) {
      return this.renderPullBranchAction(tip, remote, aheadBehind)
    }

    if (aheadBehind.ahead > 0) {
      return this.renderPushBranchAction(tip, remote, aheadBehind)
    }

    const isGitHub = this.props.repository.gitHubRepository !== null
    const hasOpenPullRequest = currentPullRequest !== null
    const isDefaultBranch =
      defaultBranch !== null && tip.branch.name === defaultBranch.name

    if (isGitHub && !hasOpenPullRequest && !isDefaultBranch) {
      return this.renderCreatePullRequestAction(tip)
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
        key="publish-repository-action"
        title="Publish your repository to GitHub"
        description="This repository is currently only available on your local machine. By publishing it on GitHub you can share it, and collaborate with others."
        discoverabilityContent={discoverabilityContent}
        buttonText="Publish repository"
        menuItemId={itemId}
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderPublishBranchAction(tip: IValidBranch) {
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

    const isGitHub = this.props.repository.gitHubRepository !== null

    const description = (
      <>
        The current branch (<Ref>{tip.branch.name}</Ref>) hasn't been published
        to the remote yet. By publishing it {isGitHub ? 'to GitHub' : ''} you
        can share it, {isGitHub ? 'open a pull request, ' : ''}
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
        key="publish-branch-action"
        title="Publish your branch"
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText="Publish branch"
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderPullBranchAction(
    tip: IValidBranch,
    remote: IRemote,
    aheadBehind: IAheadBehind
  ) {
    const itemId: MenuIDs = 'pull'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const isGitHub = this.props.repository.gitHubRepository !== null

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
        key="pull-branch-action"
        title={title}
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText={buttonText}
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderPushBranchAction(
    tip: IValidBranch,
    remote: IRemote,
    aheadBehind: IAheadBehind
  ) {
    const itemId: MenuIDs = 'push'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const isGitHub = this.props.repository.gitHubRepository !== null

    const description = (
      <>
        You have{' '}
        {aheadBehind.ahead === 1 ? 'one local commit' : 'local commits'} waiting
        to be pushed to {isGitHub ? 'GitHub' : 'the remote'}
      </>
    )

    const discoverabilityContent = (
      <>
        Always available in the toolbar when there are local commits waiting to
        be pushed or {this.renderDiscoverabilityKeyboardShortcut(menuItem)}
      </>
    )

    const title = `Push ${aheadBehind.ahead} ${
      aheadBehind.ahead === 1 ? 'commit' : 'commits'
    } to the ${remote.name} remote`

    const buttonText = `Push ${remote.name}`

    return (
      <MenuBackedBlankslateAction
        key="push-branch-action"
        title={title}
        menuItemId={itemId}
        description={description}
        discoverabilityContent={discoverabilityContent}
        buttonText={buttonText}
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderCreatePullRequestAction(tip: IValidBranch) {
    const itemId: MenuIDs = 'create-pull-request'
    const menuItem = this.getMenuItemInfo(itemId)

    if (menuItem === undefined) {
      log.error(`Could not find matching menu item for ${itemId}`)
      return null
    }

    const description = (
      <>
        The current branch (<Ref>{tip.branch.name}</Ref>) is already published
        to GitHub. Create a pull request to propose and collaborate on your
        changes.
      </>
    )

    const title = `Create a Pull Request from your current branch`
    const buttonText = `Create Pull Request`

    return (
      <MenuBackedBlankslateAction
        key="create-pr-action"
        title={title}
        menuItemId={itemId}
        description={description}
        buttonText={buttonText}
        discoverabilityContent={this.renderDiscoverabilityElements(menuItem)}
        type="primary"
        disabled={!menuItem.enabled}
      />
    )
  }

  private renderActions() {
    return (
      <>
        <ReactCSSTransitionReplace
          transitionAppear={false}
          transitionEnter={this.state.enableTransitions}
          transitionLeave={this.state.enableTransitions}
          overflowHidden={false}
          transitionName="action"
          component="div"
          className="actions primary"
          transitionEnterTimeout={750}
          transitionLeaveTimeout={500}
        >
          {this.renderRemoteAction()}
        </ReactCSSTransitionReplace>
        <div className="actions">
          {this.renderOpenInExternalEditor()}
          {this.renderShowInFinderAction()}
          {this.renderViewOnGitHub()}
        </div>
      </>
    )
  }

  public componentDidMount() {
    this.transitionTimer = window.setTimeout(() => {
      this.setState({ enableTransitions: true })
      this.transitionTimer = null
    }, 500)
  }

  public componentWillUnmount() {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer)
    }
  }

  public render() {
    return (
      <div id="no-changes">
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
}
