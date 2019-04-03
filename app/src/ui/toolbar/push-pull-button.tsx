import * as React from 'react'

import { Progress } from '../../models/progress'
import { Repository } from '../../models/repository'
import { IAheadBehind } from '../../models/branch'
import { TipState } from '../../models/tip'
import { FetchType } from '../../models/fetch'

import { enablePullWithRebase } from '../../lib/feature-flag'

import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { RelativeTime } from '../relative-time'

import { ToolbarButton, ToolbarButtonStyle } from './button'

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

  /** If the current branch has been rebased, the user is permitted to force-push */
  readonly branchWasRebased: boolean
}

function renderAheadBehind(aheadBehind: IAheadBehind) {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0) {
    return null
  }

  const content = new Array<JSX.Element>()
  if (ahead > 0) {
    content.push(
      <span key="ahead">
        {ahead}
        <Octicon symbol={OcticonSymbol.arrowSmallUp} />
      </span>
    )
  }

  if (behind > 0) {
    content.push(
      <span key="behind">
        {behind}
        <Octicon symbol={OcticonSymbol.arrowSmallDown} />
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

/** The common props for all button states */
const defaultProps = {
  className: 'push-pull-button',
  style: ToolbarButtonStyle.Subtitle,
}

function progressButton(progress: Progress, networkActionInProgress: boolean) {
  return (
    <ToolbarButton
      {...defaultProps}
      title={progress.title}
      description={progress.description || 'Hang on…'}
      progressValue={progress.value}
      icon={OcticonSymbol.sync}
      iconClassName={networkActionInProgress ? 'spin' : ''}
      tooltip={progress.description}
      disabled={true}
    />
  )
}

function publishRepositoryButton(onClick: () => void) {
  return (
    <ToolbarButton
      {...defaultProps}
      title="Publish repository"
      description="Publish this repository to GitHub"
      className="push-pull-button"
      icon={OcticonSymbol.cloudUpload}
      style={ToolbarButtonStyle.Subtitle}
      onClick={onClick}
    />
  )
}

function unbornRepositoryButton() {
  return (
    <ToolbarButton
      {...defaultProps}
      title="Publish branch"
      description="Cannot publish unborn HEAD"
      icon={OcticonSymbol.cloudUpload}
      disabled={true}
    />
  )
}

function detachedHeadButton(rebaseInProgress: boolean) {
  const description = rebaseInProgress
    ? 'Rebase in progress'
    : 'Cannot publish detached HEAD'

  return (
    <ToolbarButton
      {...defaultProps}
      title="Publish branch"
      description={description}
      icon={OcticonSymbol.cloudUpload}
      disabled={true}
    />
  )
}

function publishBranchButton(isGitHub: boolean, onClick: () => void) {
  const description = isGitHub
    ? 'Publish this branch to GitHub'
    : 'Publish this branch to the remote'

  return (
    <ToolbarButton
      {...defaultProps}
      title="Publish branch"
      description={description}
      icon={OcticonSymbol.cloudUpload}
      onClick={onClick}
    />
  )
}

function fetchButton(
  remoteName: string,
  aheadBehind: IAheadBehind,
  lastFetched: Date | null,
  onClick: () => void
) {
  const title = `Fetch ${remoteName}`
  return (
    <ToolbarButton
      {...defaultProps}
      title={title}
      description={renderLastFetched(lastFetched)}
      icon={OcticonSymbol.sync}
      onClick={onClick}
    >
      {renderAheadBehind(aheadBehind)}
    </ToolbarButton>
  )
}

function pullButton(
  remoteName: string,
  aheadBehind: IAheadBehind,
  lastFetched: Date | null,
  pullWithRebase: boolean,
  onClick: () => void
) {
  const title =
    pullWithRebase && enablePullWithRebase()
      ? `Pull ${remoteName} with rebase`
      : `Pull ${remoteName}`

  return (
    <ToolbarButton
      {...defaultProps}
      title={title}
      description={renderLastFetched(lastFetched)}
      icon={OcticonSymbol.arrowDown}
      onClick={onClick}
    >
      {renderAheadBehind(aheadBehind)}
    </ToolbarButton>
  )
}

function pushButton(
  remoteName: string,
  aheadBehind: IAheadBehind,
  lastFetched: Date | null,
  onClick: () => void
) {
  return (
    <ToolbarButton
      {...defaultProps}
      title={`Push ${remoteName}`}
      description={renderLastFetched(lastFetched)}
      icon={OcticonSymbol.arrowUp}
      onClick={onClick}
    >
      {renderAheadBehind(aheadBehind)}
    </ToolbarButton>
  )
}

/**
 * This represents the "double arrow" icon used to show a force-push, and is a
 * less complicated icon than the generated Octicon from the `octicons` package.
 */
const forcePushIcon = new OcticonSymbol(
  10,
  16,
  'M3 11H0l5-6 5 6H7v4H3v-4zM5 1l5 6H8.33L5 3 1.662 7H0l5-6z'
)

function forcePushButton(
  remoteName: string,
  aheadBehind: IAheadBehind,
  lastFetched: Date | null,
  onClick: () => void
) {
  return (
    <ToolbarButton
      {...defaultProps}
      title={`Force push ${remoteName}`}
      description={renderLastFetched(lastFetched)}
      icon={forcePushIcon}
      onClick={onClick}
    >
      {renderAheadBehind(aheadBehind)}
    </ToolbarButton>
  )
}

/**
 * A button which pushes, pulls, or updates depending on the state of the
 * repository.
 */
export class PushPullButton extends React.Component<IPushPullButtonProps, {}> {
  private push = () => {
    this.props.dispatcher.push(this.props.repository)
  }

  private forcePushWithLease = () => {
    this.props.dispatcher.confirmOrForcePush(this.props.repository)
  }

  private pull = () => {
    this.props.dispatcher.pull(this.props.repository)
  }

  private fetch = () => {
    this.props.dispatcher.fetch(
      this.props.repository,
      FetchType.UserInitiatedTask
    )
  }

  public render() {
    const {
      progress,
      networkActionInProgress,
      aheadBehind,
      remoteName,
      repository,
      tipState,
      rebaseInProgress,
      lastFetched,
      pullWithRebase,
      branchWasRebased,
    } = this.props

    if (progress !== null) {
      return progressButton(progress, networkActionInProgress)
    }

    if (remoteName === null) {
      return publishRepositoryButton(this.push)
    }

    if (tipState === TipState.Unborn) {
      return unbornRepositoryButton()
    }

    if (tipState === TipState.Detached) {
      return detachedHeadButton(rebaseInProgress)
    }

    if (aheadBehind === null) {
      const isGitHubRepository = repository.gitHubRepository !== null
      return publishBranchButton(isGitHubRepository, this.push)
    }

    const { ahead, behind } = aheadBehind

    if (ahead === 0 && behind === 0) {
      return fetchButton(remoteName, aheadBehind, lastFetched, this.fetch)
    }

    if (branchWasRebased && behind > 0 && ahead > 0) {
      return forcePushButton(
        remoteName,
        aheadBehind,
        lastFetched,
        this.forcePushWithLease
      )
    }

    if (behind > 0) {
      return pullButton(
        remoteName,
        aheadBehind,
        lastFetched,
        pullWithRebase || false,
        this.pull
      )
    }

    return pushButton(remoteName, aheadBehind, lastFetched, this.push)
  }
}
