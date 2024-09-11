import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import * as octicons from '../octicons/octicons.generated'
import { OcticonSymbol, syncClockwise } from '../octicons'
import { Repository } from '../../models/repository'
import { Resizable } from '../resizable'
import { TipState } from '../../models/tip'
import { ToolbarDropdown, DropdownState } from './dropdown'
import {
  FoldoutType,
  IConstrainedValue,
  IRepositoryState,
  isRebaseConflictState,
} from '../../lib/app-state'
import { BranchesContainer, PullRequestBadge } from '../branches'
import { assertNever } from '../../lib/fatal-error'
import { BranchesTab } from '../../models/branches-tab'
import { PullRequest } from '../../models/pull-request'
import classNames from 'classnames'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { DragType } from '../../models/drag-drop'
import { CICheckRunPopover } from '../check-runs/ci-check-run-popover'
import { TooltipTarget } from '../lib/tooltip'
import { BranchType, Branch } from '../../models/branch'
import { PopupType } from '../../models/popup'
import { generateBranchContextMenuItems } from '../branches/branch-list-item-context-menu'
import { showContextualMenu } from '../../lib/menu-item'
import { Emoji } from '../../lib/emoji'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'

interface IBranchDropdownProps {
  readonly dispatcher: Dispatcher

  /** The currently selected repository. */
  readonly repository: Repository

  /** The current repository state as derived from AppState */
  readonly repositoryState: IRepositoryState

  /** The width of the resizable branch dropdown button, as derived from AppState. */
  readonly branchDropdownWidth: IConstrainedValue

  /** Whether or not the branch dropdown is currently open */
  readonly isOpen: boolean

  /**
   * An event handler for when the drop down is opened, or closed, by a pointer
   * event or by pressing the space or enter key while focused.
   *
   * @param state    - The new state of the drop down
   */
  readonly onDropDownStateChanged: (state: DropdownState) => void

  /** The currently selected tab. */
  readonly selectedTab: BranchesTab

  /** The open pull requests in the repository. */
  readonly pullRequests: ReadonlyArray<PullRequest>

  /** The pull request associated with the current branch. */
  readonly currentPullRequest: PullRequest | null

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean

  /** Whether this component should show its onboarding tutorial nudge arrow */
  readonly shouldNudge: boolean

  readonly showCIStatusPopover: boolean

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, Emoji>

  /** Whether the dropdown will trap focus or not. Defaults to true.
   *
   * Example of usage: If a dropdown is open and then a dialog subsequently, the
   * focus trap logic will stop propagation of the focus event to the dialog.
   * Thus, we want to disable this when dialogs are open since they will be
   * using the dialog focus management.
   */
  readonly enableFocusTrap: boolean

  readonly underlineLinks: boolean
}

/**
 * A drop down for selecting the currently checked out branch.
 */
export class BranchDropdown extends React.Component<IBranchDropdownProps> {
  private badgeRef: HTMLElement | null = null

  private renderBranchFoldout = (): JSX.Element | null => {
    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState

    const tip = repositoryState.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    return (
      <BranchesContainer
        allBranches={branchesState.allBranches}
        recentBranches={branchesState.recentBranches}
        currentBranch={currentBranch}
        defaultBranch={branchesState.defaultBranch}
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        selectedTab={this.props.selectedTab}
        pullRequests={this.props.pullRequests}
        currentPullRequest={this.props.currentPullRequest}
        isLoadingPullRequests={this.props.isLoadingPullRequests}
        emoji={this.props.emoji}
        onDeleteBranch={this.onDeleteBranch}
        onRenameBranch={this.onRenameBranch}
        underlineLinks={this.props.underlineLinks}
      />
    )
  }

  private onDropDownStateChanged = (state: DropdownState) => {
    // Don't allow opening the drop down when checkout is in progress
    if (state === 'open' && this.props.repositoryState.checkoutProgress) {
      return
    }

    this.props.onDropDownStateChanged(state)
  }

  public render() {
    const { repositoryState, enableFocusTrap } = this.props
    const { branchesState, checkoutProgress, changesState } = repositoryState
    const { tip } = branchesState
    const { conflictState } = changesState

    const tipKind = tip.kind

    let icon: OcticonSymbol = octicons.gitBranch
    let iconClassName: string | undefined = undefined
    let title: string
    let description = __DARWIN__ ? 'Current Branch' : 'Current branch'
    let canOpen = true
    let disabled = false
    let tooltip: string

    if (this.props.currentPullRequest) {
      icon = octicons.gitPullRequest
    }

    if (tip.kind === TipState.Unknown) {
      // TODO: this is bad and I feel bad
      return null
    } else if (tip.kind === TipState.Unborn) {
      title = tip.ref
      tooltip = `Current branch is ${tip.ref}`
      canOpen = branchesState.allBranches.some(
        b => !b.isDesktopForkRemoteBranch
      )
    } else if (tip.kind === TipState.Detached) {
      title = `On ${tip.currentSha.substring(0, 7)}`
      tooltip = 'Currently on a detached HEAD'
      icon = octicons.gitCommit
      description = 'Detached HEAD'
    } else if (tip.kind === TipState.Valid) {
      title = tooltip = tip.branch.name
    } else {
      return assertNever(tip, `Unknown tip state: ${tipKind}`)
    }

    let progressValue: number | undefined = undefined

    if (checkoutProgress) {
      title = checkoutProgress.target
      description = checkoutProgress.description

      if (checkoutProgress.value > 0) {
        const friendlyProgress = Math.round(checkoutProgress.value * 100)
        description = `${description} (${friendlyProgress}%)`
      }

      tooltip = `Checking out ${checkoutProgress.target}`
      progressValue = checkoutProgress.value
      icon = syncClockwise
      iconClassName = 'spin'
      canOpen = false
    } else if (conflictState !== null && isRebaseConflictState(conflictState)) {
      title = conflictState.targetBranch
      description = 'Rebasing branch'
      icon = octicons.gitBranch
      canOpen = false
      disabled = true
      tooltip = `Rebasing ${conflictState.targetBranch}`
    }

    const isOpen = this.props.isOpen
    const currentState: DropdownState = isOpen && canOpen ? 'open' : 'closed'
    const buttonClassName = classNames('branch-toolbar-button', 'nudge-arrow', {
      'nudge-arrow-up': this.props.shouldNudge,
    })

    if (!enableResizingToolbarButtons()) {
      return (
        <>
          <ToolbarDropdown
            className="branch-button"
            icon={icon}
            iconClassName={iconClassName}
            title={title}
            description={description}
            onContextMenu={this.onBranchToolbarButtonContextMenu}
            tooltip={isOpen ? undefined : tooltip}
            onDropdownStateChanged={this.onDropDownStateChanged}
            dropdownContentRenderer={this.renderBranchFoldout}
            dropdownState={currentState}
            disabled={disabled}
            showDisclosureArrow={canOpen}
            progressValue={progressValue}
            buttonClassName={buttonClassName}
            onMouseEnter={this.onMouseEnter}
            onlyShowTooltipWhenOverflowed={true}
            isOverflowed={isDescriptionOverflowed}
            enableFocusTrap={enableFocusTrap}
          >
            {this.renderPullRequestInfo()}
          </ToolbarDropdown>
          {this.props.showCIStatusPopover && this.renderPopover()}
        </>
      )
    }

    // Properties to override the default foldout style for the branch dropdown.
    // The min width of the foldout is different from `branchDropdownWidth.min`
    // because the branches list foldout min width we want set to 365px instead.
    const foldoutStyleOverrides: React.CSSProperties = {
      width: this.props.branchDropdownWidth.value,
      maxWidth: this.props.branchDropdownWidth.max,
      minWidth: 365,
    }

    return (
      <>
        <Resizable
          width={this.props.branchDropdownWidth.value}
          onReset={this.onReset}
          onResize={this.onResize}
          maximumWidth={this.props.branchDropdownWidth.max}
          minimumWidth={this.props.branchDropdownWidth.min}
        >
          <ToolbarDropdown
            className="branch-button"
            icon={icon}
            iconClassName={iconClassName}
            title={title}
            description={description}
            foldoutStyleOverrides={foldoutStyleOverrides}
            onContextMenu={this.onBranchToolbarButtonContextMenu}
            tooltip={isOpen ? undefined : tooltip}
            onDropdownStateChanged={this.onDropDownStateChanged}
            dropdownContentRenderer={this.renderBranchFoldout}
            dropdownState={currentState}
            disabled={disabled}
            showDisclosureArrow={canOpen}
            progressValue={progressValue}
            buttonClassName={buttonClassName}
            onMouseEnter={this.onMouseEnter}
            onlyShowTooltipWhenOverflowed={true}
            isOverflowed={isDescriptionOverflowed}
            enableFocusTrap={enableFocusTrap}
          >
            {this.renderPullRequestInfo()}
          </ToolbarDropdown>
          {this.props.showCIStatusPopover && this.renderPopover()}
        </Resizable>
      </>
    )
  }

  private onResize = (width: number) => {
    this.props.dispatcher.setBranchDropdownWidth(width)
  }

  private onReset = () => {
    this.props.dispatcher.resetBranchDropdownWidth()
  }

  /**
   * Method to capture when the mouse is over the branch dropdown button.
   *
   * We currently only use this in conjunction with dragging cherry picks so
   * that we can open the branch menu when dragging a commit over it.
   */
  private onMouseEnter = (): void => {
    if (dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      dragAndDropManager.emitEnterDragZone('branch-button')
      this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
    }
  }

  private onBranchToolbarButtonContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault()

    const { tip } = this.props.repositoryState.branchesState

    if (tip.kind !== TipState.Valid) {
      return
    }

    const items = generateBranchContextMenuItems({
      name: tip.branch.name,
      isLocal: tip.branch.type === BranchType.Local,
      onRenameBranch: this.onRenameBranch,
      onDeleteBranch: this.onDeleteBranch,
    })

    showContextualMenu(items)
  }

  private getBranchWithName(branchName: string): Branch | undefined {
    return this.props.repositoryState.branchesState.allBranches.find(
      branch => branch.name === branchName
    )
  }

  private onRenameBranch = (branchName: string) => {
    const branch = this.getBranchWithName(branchName)

    if (branch === undefined) {
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.RenameBranch,
      repository: this.props.repository,
      branch,
    })
  }

  private onDeleteBranch = async (branchName: string) => {
    const branch = this.getBranchWithName(branchName)
    const { dispatcher, repository } = this.props

    if (branch === undefined) {
      return
    }

    if (branch.type === BranchType.Remote) {
      dispatcher.showPopup({
        type: PopupType.DeleteRemoteBranch,
        repository,
        branch,
      })
      return
    }

    const aheadBehind = await dispatcher.getBranchAheadBehind(
      repository,
      branch
    )
    dispatcher.showPopup({
      type: PopupType.DeleteBranch,
      repository,
      branch,
      existsOnRemote: aheadBehind !== null,
    })
  }

  private onBadgeClick = () => {
    // The badge can't be clicked while the CI status popover is shown, because
    // in that case the Popover component will recognize the "click outside"
    // event and close the popover.
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.openPopover()
  }

  private openPopover = () => {
    this.props.dispatcher.setShowCIStatusPopover(true)
  }

  private closePopover = (event?: MouseEvent) => {
    if (event === undefined) {
      this.props.dispatcher.setShowCIStatusPopover(false)
      return
    }

    const { target } = event
    const prBadgeElem = document.getElementById('pr-badge')
    const rerunDialog = document.getElementById('rerun-check-runs')
    if (
      target !== null &&
      target instanceof Node &&
      ((prBadgeElem !== null && prBadgeElem.contains(target)) ||
        (rerunDialog !== null && rerunDialog.contains(target)))
    ) {
      return
    }

    this.props.dispatcher.setShowCIStatusPopover(false)
  }

  private renderPopover() {
    const pr = this.props.currentPullRequest
    const { tip } = this.props.repositoryState.branchesState
    // This is used for retrieving the PR's action check runs (if exist). For
    // forked repo PRs, we must use the upstreamWithoutRemote as we make are own
    // temporary branch in Desktop for these that doesn't exist remotely (and
    // thus doesn't exist in action's world). The upstreamWIthoutRemote will
    // match a non forked PR. It _should_ only be null for a local branch..
    // which _should_ not happen in this context. But, worst case, the user
    // simply won't be able to retreive action steps and will get check run list
    // items that are given for non-action checks.
    const currentBranchName =
      tip.kind === TipState.Valid
        ? tip.branch.upstreamWithoutRemote ?? tip.branch.name
        : ''

    if (pr === null) {
      return null
    }

    return (
      <CICheckRunPopover
        prNumber={pr.pullRequestNumber}
        dispatcher={this.props.dispatcher}
        repository={pr.base.gitHubRepository}
        branchName={currentBranchName}
        anchor={this.badgeRef}
        closePopover={this.closePopover}
      />
    )
  }

  private onBadgeRef = (ref: HTMLButtonElement | null) => {
    this.badgeRef = ref
  }

  private renderPullRequestInfo() {
    const pr = this.props.currentPullRequest

    if (pr === null) {
      return null
    }

    return (
      <PullRequestBadge
        number={pr.pullRequestNumber}
        dispatcher={this.props.dispatcher}
        repository={pr.base.gitHubRepository}
        onBadgeRef={this.onBadgeRef}
        onBadgeClick={this.onBadgeClick}
        showCIStatusPopover={this.props.showCIStatusPopover}
      />
    )
  }
}

const isDescriptionOverflowed = (target: TooltipTarget) => {
  const elem = target.querySelector('.title') ?? target
  return elem.scrollWidth > elem.clientWidth
}
