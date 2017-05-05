import { MenuIDs } from '../main-process/menu'
import { merge } from './merge'
import { IAppState, SelectionType } from '../lib/app-state'
import { Repository } from '../models/repository'
import { CloningRepository } from './dispatcher'
import { TipState } from '../models/tip'
import { updateMenuState as ipcUpdateMenuState } from '../ui/main-process-proxy'

export interface IMenuItemState {
  readonly visible?: boolean,
  readonly enabled?: boolean
}

/**
 * Utility class for coalescing updates to menu items
 */
export class MenuUpdateRequest {

  private _state: { [id: string]: IMenuItemState } = { }

  /**
   * Returns an object where each key is a MenuID and the values
   * are IMenuItemState instances containing information about
   * whether a particular menu item should be enabled/disabled or
   * visible/hidden.
   */
  public get state() {
    return this._state
  }

  private updateMenuItem<K extends keyof IMenuItemState>(id: MenuIDs, state: Pick<IMenuItemState, K>) {
    const currentState = this._state[id] || { }
    this._state[id] = merge(currentState, state)
  }

  /** Set the state of the given menu item id to enabled */
  public enable(id: MenuIDs): this {
    this.updateMenuItem(id, { enabled: true })
    return this
  }

  /** Set the state of the given menu item id to disabled */
  public disable(id: MenuIDs): this {
    this.updateMenuItem(id, { enabled: false })
    return this
  }

  /** Set the enabledness of the given menu item id */
  public setEnabled(id: MenuIDs, enabled: boolean): this {
    this.updateMenuItem(id, { enabled })
    return this
  }

  /** Set the state of the given menu item id to visible */
  public show(id: MenuIDs): this {
    this.updateMenuItem(id, { visible: true })
    return this
  }

  /** Set the state of the given menu item id to hidden */
  public hide(id: MenuIDs): this {
    this.updateMenuItem(id, { visible: false })
    return this
  }

  /** Set the visibility of the given menu item id */
  public setVisible(id: MenuIDs, visible: boolean): this {
    this.updateMenuItem(id, { visible: visible })
    return this
  }
}

function isRepositoryHostedOnGitHub(repository: Repository | CloningRepository) {
  if (!repository || repository instanceof CloningRepository || !repository.gitHubRepository) {
    return false
  }

  return repository.gitHubRepository.htmlURL !== null
}

/**
 * Update the menu state in the main process.
 * 
 * This function will set the enabledness and visibility of menu items
 * in the main process based on the AppState. All changes will be
 * batched together into one ipc message.
 */
export function updateMenuState(state: IAppState) {
  const selectedState = state.selectedState
  const isHostedOnGitHub = selectedState
    ? isRepositoryHostedOnGitHub(selectedState.repository)
    : false

  let repositorySelected = false
  let onNonDefaultBranch = false
  let onBranch = false
  let hasDefaultBranch = false
  let hasPublishedBranch = false
  let networkActionInProgress = false
  let tipStateIsUnknown = false

  if (selectedState && selectedState.type === SelectionType.Repository) {
    repositorySelected = true

    const branchesState = selectedState.state.branchesState
    const tip = branchesState.tip
    const defaultBranch = branchesState.defaultBranch

    hasDefaultBranch = Boolean(defaultBranch)

    onBranch = tip.kind === TipState.Valid
    tipStateIsUnknown = tip.kind === TipState.Unknown

    // If we are:
    //  1. on the default branch, or
    //  2. on an unborn branch, or
    //  3. on a detached HEAD
    // there's not much we can do.
    if (tip.kind === TipState.Valid) {
      if (defaultBranch !== null) {
        onNonDefaultBranch = tip.branch.name !== defaultBranch.name
      }

      hasPublishedBranch = !!tip.branch.upstream
    } else {
      onNonDefaultBranch = true
    }

    networkActionInProgress = selectedState.state.isPushPullFetchInProgress
  }

  // These are IDs for menu items that are entirely _and only_
  // repository-scoped. They're always enabled if we're in a repository and
  // always disabled if we're not.
  const repositoryScopedIDs: ReadonlyArray<MenuIDs> = [
    'branch',
    'repository',
    'remove-repository',
    'open-in-shell',
    'open-working-directory',
    'show-repository-settings',
    'create-branch',
    'show-changes',
    'show-history',
    'show-repository-list',
    'show-branches-list',
  ]

  const menuState = new MenuUpdateRequest()

  const windowOpen = state.windowState !== 'hidden'
  const repositoryActive = windowOpen && repositorySelected
  if (repositoryActive) {
    for (const id of repositoryScopedIDs) {
      menuState.enable(id)
    }

    menuState.setEnabled('rename-branch', onNonDefaultBranch)
    menuState.setEnabled('delete-branch', onNonDefaultBranch)
    menuState.setEnabled('update-branch', onNonDefaultBranch && hasDefaultBranch)
    menuState.setEnabled('merge-branch', onBranch)
    menuState.setEnabled('compare-branch', isHostedOnGitHub && hasPublishedBranch)

    menuState.setEnabled('view-repository-on-github', isHostedOnGitHub)
    menuState.setEnabled('push', !networkActionInProgress)
    menuState.setEnabled('pull', !networkActionInProgress)
    menuState.setEnabled('create-branch', !tipStateIsUnknown)
  } else {
    for (const id of repositoryScopedIDs) {
      menuState.disable(id)
    }

    menuState.disable('rename-branch')
    menuState.disable('delete-branch')
    menuState.disable('update-branch')
    menuState.disable('merge-branch')
    menuState.disable('compare-branch')

    menuState.disable('view-repository-on-github')
    menuState.disable('push')
    menuState.disable('pull')
  }

  ipcUpdateMenuState(menuState)
}
