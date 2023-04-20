import * as React from 'react'

import { Progress } from '../../models/progress'
import { Repository } from '../../models/repository'
import { IAheadBehind } from '../../models/branch'
import { TipState } from '../../models/tip'
import { FetchType } from '../../models/fetch'

import { Dispatcher } from '../dispatcher'
import { Octicon, syncClockwise } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { RelativeTime } from '../relative-time'

import { ToolbarButton, ToolbarButtonStyle } from './button'
import classNames from 'classnames'
import {
  DropdownState,
  IToolbarDropdownProps,
  ToolbarDropdown,
  ToolbarDropdownStyle,
} from './dropdown'
import { FoldoutType } from '../../lib/app-state'
import { ForcePushBranchState } from '../../lib/rebase'
import { PushPullButtonDropDown } from './push-pull-button-dropdown'
import { enablePushPullFetchDropdown } from '../../lib/feature-flag'

export const DropdownItemClassName = 'push-pull-dropdown-item'

interface IPushPullButtonProps {
  /**
   * The ahead/behind count for the current branch. If null, it indicates the
   * branch doesn't have an upstream.
   */
  readonly aheadBehind: IAheadBehind | null

  /** The name of the remote. */
  readonly remoteName: string | null

  /** Is a push/pull/fetch in progress? */
  readonly networkActionInProgress: boolean

  /** The date of the last fetch. */
  readonly lastFetched: Date | null

  /** Progress information associated with the current operation */
  readonly progress: Progress | null

  /** The global dispatcher, to invoke repository operations. */
  readonly dispatcher: Dispatcher

  /** The current repository */
  readonly repository: Repository

  /**
   * Indicate whether the current branch is valid, unborn or detached HEAD
   *
   * Used for setting the enabled/disabled and the description text.
   */
  readonly tipState: TipState

  /** Has the user configured pull.rebase to anything? */
  readonly pullWithRebase?: boolean

  /** Is the detached HEAD state related to a rebase or not? */
  readonly rebaseInProgress: boolean

  /** Force push state of the current branch */
  readonly forcePushBranchState: ForcePushBranchState

  /** Whether this component should show its onboarding tutorial nudge arrow */
  readonly shouldNudge: boolean

  /**
   * The number of tags that would get pushed if the user performed a push.
   */
  readonly numTagsToPush: number

  /** Whether or not the push-pull dropdown is currently open */
  readonly isDropdownOpen: boolean

  /** Will the app prompt the user to confirm a force push? */
  readonly askForConfirmationOnForcePush: boolean

  /**
   * An event handler for when the drop down is opened, or closed, by a pointer
   * event or by pressing the space or enter key while focused.
   *
   * @param state    - The new state of the drop down
   */
  readonly onDropdownStateChanged: (state: DropdownState) => void
}

export enum DropdownItemType {
  Fetch = 'fetch',
  ForcePush = 'force-push',
}

export type DropdownItem = {
  readonly title: string
  readonly description: string | JSX.Element
  readonly action: () => void
  readonly icon: OcticonSymbol.OcticonSymbolType
}

function renderAheadBehind(aheadBehind: IAheadBehind, numTagsToPush: number) {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0 && numTagsToPush === 0) {
    return null
  }

  const content = new Array<JSX.Element>()
  if (ahead > 0 || numTagsToPush > 0) {
    content.push(
      <span key="ahead">
        {ahead + numTagsToPush}
        <Octicon symbol={OcticonSymbol.arrowUp} />
      </span>
    )
  }

  if (behind > 0) {
    content.push(
      <span key="behind">
        {behind}
        <Octicon symbol={OcticonSymbol.arrowDown} />
      </span>
    )
  }

  return <div className="ahead-behind">{content}</div>
}

function renderLastFetched(lastFetched: Date | null): JSX.Element | string {
  if (lastFetched) {
    return (
      <span>
        Last fetched <RelativeTime date={lastFetched} />
      </span>
    )
  } else {
    return 'Never fetched'
  }
}

/**
 * This represents the "double arrow" icon used to show a force-push, and is a
 * less complicated icon than the generated Octicon from the `octicons` package.
 */
export const forcePushIcon: OcticonSymbol.OcticonSymbolType = {
  w: 10,
  h: 16,
  d:
    'M0 6a.75.75 0 0 0 .974.714L4.469 3.22a.75.75 0 0 1 1.06 0l3.478 3.478a.75.75 ' +
    '0 0 0 .772-1.228L5.53 1.22a.75.75 0 0 0-1.06 0L.22 5.47A.75.75 0 0 0 0 6zm0 ' +
    '3a.75.75 0 0 0 1.28.53l2.97-2.97V14a.75.75 0 1 0 1.5 0V6.56l2.97 2.97a.75.75 ' +
    '0 0 0 1.06-1.06L5.53 4.22a.75.75 0 0 0-1.06 0L.22 8.47A.75.75 0 0 0 0 9z',
  fr: 'evenodd',
}

/**
 * A button which pushes, pulls, or updates depending on the state of the
 * repository.
 */
export class PushPullButton extends React.Component<IPushPullButtonProps> {
  /** The common props for all button states */
  private defaultButtonProps() {
    return {
      className: 'push-pull-button',
      style: ToolbarButtonStyle.Subtitle,
    }
  }

  /** The common props for all dropdown states */
  private defaultDropdownProps(): Omit<
    IToolbarDropdownProps,
    'dropdownContentRenderer'
  > {
    return {
      buttonClassName: 'push-pull-button',
      style: ToolbarButtonStyle.Subtitle,
      dropdownStyle: ToolbarDropdownStyle.MultiOption,
      dropdownState: this.props.isDropdownOpen ? 'open' : 'closed',
      onDropdownStateChanged: this.props.onDropdownStateChanged,
    }
  }

  private closeDropdown() {
    this.props.dispatcher.closeFoldout(FoldoutType.PushPull)
  }

  private push = () => {
    this.closeDropdown()
    this.props.dispatcher.push(this.props.repository)
  }

  private forcePushWithLease = () => {
    this.closeDropdown()
    this.props.dispatcher.confirmOrForcePush(this.props.repository)
  }

  private pull = () => {
    this.closeDropdown()
    this.props.dispatcher.pull(this.props.repository)
  }

  private fetch = () => {
    this.closeDropdown()
    this.props.dispatcher.fetch(
      this.props.repository,
      FetchType.UserInitiatedTask
    )
  }

  private getDropdownContentRenderer(
    itemTypes: ReadonlyArray<DropdownItemType>
  ) {
    return () => {
      return (
        <PushPullButtonDropDown
          itemTypes={itemTypes}
          remoteName={this.props.remoteName}
          fetch={this.fetch}
          forcePushWithLease={this.forcePushWithLease}
          askForConfirmationOnForcePush={
            this.props.askForConfirmationOnForcePush
          }
        />
      )
    }
  }

  public render() {
    return this.renderButton()
  }

  private renderButton() {
    const {
      progress,
      networkActionInProgress,
      aheadBehind,
      numTagsToPush,
      remoteName,
      repository,
      tipState,
      rebaseInProgress,
      lastFetched,
      pullWithRebase,
      forcePushBranchState,
    } = this.props

    if (progress !== null) {
      return this.progressButton(progress, networkActionInProgress)
    }

    if (remoteName === null) {
      return this.publishRepositoryButton(this.push)
    }

    if (tipState === TipState.Unborn) {
      return this.unbornRepositoryButton()
    }

    if (tipState === TipState.Detached) {
      return this.detachedHeadButton(rebaseInProgress)
    }

    if (aheadBehind === null) {
      const isGitHubRepository = repository.gitHubRepository !== null
      return this.publishBranchButton(
        isGitHubRepository,
        this.push,
        this.props.shouldNudge
      )
    }

    const { ahead, behind } = aheadBehind

    if (ahead === 0 && behind === 0 && numTagsToPush === 0) {
      return this.fetchButton(remoteName, lastFetched, this.fetch)
    }

    if (forcePushBranchState === ForcePushBranchState.Recommended) {
      return this.forcePushButton(
        remoteName,
        aheadBehind,
        numTagsToPush,
        lastFetched,
        this.forcePushWithLease
      )
    }

    if (behind > 0) {
      return this.pullButton(
        remoteName,
        aheadBehind,
        numTagsToPush,
        lastFetched,
        pullWithRebase || false,
        forcePushBranchState,
        this.pull
      )
    }

    return this.pushButton(
      remoteName,
      aheadBehind,
      numTagsToPush,
      lastFetched,
      this.push
    )
  }

  private progressButton(progress: Progress, networkActionInProgress: boolean) {
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title={progress.title}
        description={progress.description || 'Hang on…'}
        progressValue={progress.value}
        icon={syncClockwise}
        iconClassName={networkActionInProgress ? 'spin' : ''}
        tooltip={progress.description}
        disabled={true}
      />
    )
  }

  private publishRepositoryButton(onClick: () => void) {
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title="Publish repository"
        description="Publish this repository to GitHub"
        className="push-pull-button"
        icon={OcticonSymbol.upload}
        style={ToolbarButtonStyle.Subtitle}
        onClick={onClick}
      />
    )
  }

  private unbornRepositoryButton() {
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title="Publish branch"
        description="Cannot publish unborn HEAD"
        icon={OcticonSymbol.upload}
        disabled={true}
      />
    )
  }

  private detachedHeadButton(rebaseInProgress: boolean) {
    const description = rebaseInProgress
      ? 'Rebase in progress'
      : 'Cannot publish detached HEAD'

    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title="Publish branch"
        description={description}
        icon={OcticonSymbol.upload}
        disabled={true}
      />
    )
  }

  private publishBranchButton(
    isGitHub: boolean,
    onClick: () => void,
    shouldNudge: boolean
  ) {
    const description = isGitHub
      ? 'Publish this branch to GitHub'
      : 'Publish this branch to the remote'

    if (!enablePushPullFetchDropdown()) {
      const className = classNames(
        this.defaultButtonProps().className,
        'nudge-arrow',
        {
          'nudge-arrow-up': shouldNudge,
        }
      )

      return (
        <ToolbarButton
          {...this.defaultButtonProps()}
          title="Publish branch"
          description={description}
          icon={OcticonSymbol.upload}
          onClick={onClick}
          className={className}
        />
      )
    }

    const className = classNames(
      this.defaultDropdownProps().className,
      'nudge-arrow',
      {
        'nudge-arrow-up': shouldNudge,
      }
    )

    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title="Publish branch"
        description={description}
        icon={OcticonSymbol.upload}
        onClick={onClick}
        className={className}
        dropdownContentRenderer={this.getDropdownContentRenderer([
          DropdownItemType.Fetch,
        ])}
      />
    )
  }

  private fetchButton(
    remoteName: string,
    lastFetched: Date | null,
    onClick: () => void
  ) {
    const title = `Fetch ${remoteName}`
    return (
      <ToolbarButton
        {...this.defaultButtonProps()}
        title={title}
        description={renderLastFetched(lastFetched)}
        icon={syncClockwise}
        onClick={onClick}
      />
    )
  }

  private pullButton(
    remoteName: string,
    aheadBehind: IAheadBehind,
    numTagsToPush: number,
    lastFetched: Date | null,
    pullWithRebase: boolean,
    forcePushBranchState: ForcePushBranchState,
    onClick: () => void
  ) {
    const title = pullWithRebase
      ? `Pull ${remoteName} with rebase`
      : `Pull ${remoteName}`

    const dropdownItemTypes = [DropdownItemType.Fetch]

    if (forcePushBranchState !== ForcePushBranchState.NotAvailable) {
      dropdownItemTypes.push(DropdownItemType.ForcePush)
    }

    if (!enablePushPullFetchDropdown()) {
      return (
        <ToolbarButton
          {...this.defaultButtonProps()}
          title={title}
          description={renderLastFetched(lastFetched)}
          icon={OcticonSymbol.arrowDown}
          onClick={onClick}
        >
          {renderAheadBehind(aheadBehind, numTagsToPush)}
        </ToolbarButton>
      )
    }

    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title={title}
        description={renderLastFetched(lastFetched)}
        icon={OcticonSymbol.arrowDown}
        onClick={onClick}
        dropdownContentRenderer={this.getDropdownContentRenderer(
          dropdownItemTypes
        )}
      >
        {renderAheadBehind(aheadBehind, numTagsToPush)}
      </ToolbarDropdown>
    )
  }

  private pushButton(
    remoteName: string,
    aheadBehind: IAheadBehind,
    numTagsToPush: number,
    lastFetched: Date | null,
    onClick: () => void
  ) {
    if (!enablePushPullFetchDropdown()) {
      return (
        <ToolbarButton
          {...this.defaultButtonProps()}
          title={`Push ${remoteName}`}
          description={renderLastFetched(lastFetched)}
          icon={OcticonSymbol.arrowUp}
          onClick={onClick}
        >
          {renderAheadBehind(aheadBehind, numTagsToPush)}
        </ToolbarButton>
      )
    }

    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title={`Push ${remoteName}`}
        description={renderLastFetched(lastFetched)}
        icon={OcticonSymbol.arrowUp}
        onClick={onClick}
        dropdownContentRenderer={this.getDropdownContentRenderer([
          DropdownItemType.Fetch,
        ])}
      >
        {renderAheadBehind(aheadBehind, numTagsToPush)}
      </ToolbarDropdown>
    )
  }

  private forcePushButton(
    remoteName: string,
    aheadBehind: IAheadBehind,
    numTagsToPush: number,
    lastFetched: Date | null,
    onClick: () => void
  ) {
    if (!enablePushPullFetchDropdown()) {
      return (
        <ToolbarButton
          {...this.defaultButtonProps()}
          title={`Force push ${remoteName}`}
          description={renderLastFetched(lastFetched)}
          icon={forcePushIcon}
          onClick={onClick}
        >
          {renderAheadBehind(aheadBehind, numTagsToPush)}
        </ToolbarButton>
      )
    }

    return (
      <ToolbarDropdown
        {...this.defaultDropdownProps()}
        title={`Force push ${remoteName}`}
        description={renderLastFetched(lastFetched)}
        icon={forcePushIcon}
        onClick={onClick}
        dropdownContentRenderer={this.getDropdownContentRenderer([
          DropdownItemType.Fetch,
        ])}
      >
        {renderAheadBehind(aheadBehind, numTagsToPush)}
      </ToolbarDropdown>
    )
  }
}
