import * as React from 'react'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { Progress } from '../../models/progress'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { IAheadBehind } from '../../models/branch'
import { TipState } from '../../models/tip'
import { RelativeTime } from '../relative-time'
import { FetchType } from '../../models/fetch'
import { enablePullWithRebase } from '../../lib/feature-flag'

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

/**
 * This represents the "double arrow" icon used to show a force-push, and is a
 * less complicated icon than the generated Octicon from the `octicons` package.
 */
const forcePushIcon = new OcticonSymbol(
  10,
  16,
  'M3 11H0l5-6 5 6H7v4H3v-4zM5 1l5 6H8.33L5 3 1.662 7H0l5-6z'
)

function getActionLabel(
  aheadBehind: IAheadBehind,
  remoteName: string,
  branchWasRebased: boolean,
  pullWithRebase?: boolean
) {
  if (isBranchRebased(branchWasRebased, aheadBehind)) {
    return `Force push ${remoteName}`
  }

  const { ahead, behind } = aheadBehind
  if (behind > 0) {
    return pullWithRebase && enablePullWithRebase()
      ? `Pull ${remoteName} with rebase`
      : `Pull ${remoteName}`
  }
  if (ahead > 0) {
    return `Push ${remoteName}`
  }
  return `Fetch ${remoteName}`
}

function isBranchRebased(branchWasRebased: boolean, aheadBehind: IAheadBehind) {
  return branchWasRebased && aheadBehind.behind > 0 && aheadBehind.ahead > 0
}

/**
 * A button which pushes, pulls, or updates depending on the state of the
 * repository.
 */
export class PushPullButton extends React.Component<IPushPullButtonProps, {}> {
  public render() {
    const progress = this.props.progress

    const title = progress ? progress.title : this.getTitle()

    const description = progress
      ? progress.description || 'Hang on…'
      : this.getDescription(this.props.tipState)

    const progressValue = progress ? progress.value : undefined

    const networkActive =
      this.props.networkActionInProgress || !!this.props.progress

    // if we have a remote associated with this repository, we should enable this branch
    // when the tip is valid (no detached HEAD, no unborn repository)
    //
    // otherwise we consider the repository unpublished, and they should be able to
    // open the publish dialog - we'll handle publishing the current branch afterwards
    // if it exists
    const validState = this.props.remoteName
      ? this.props.tipState === TipState.Valid
      : true

    const disabled = !validState || networkActive

    return (
      <ToolbarButton
        title={title}
        description={description}
        progressValue={progressValue}
        className="push-pull-button"
        icon={this.getIcon()}
        iconClassName={this.props.networkActionInProgress ? 'spin' : ''}
        style={ToolbarButtonStyle.Subtitle}
        onClick={this.performAction}
        tooltip={progress ? progress.description : undefined}
        disabled={disabled}
      >
        {this.renderAheadBehind()}
      </ToolbarButton>
    )
  }

  private renderAheadBehind() {
    if (!this.props.aheadBehind || this.props.progress) {
      return null
    }

    const { ahead, behind } = this.props.aheadBehind
    if (ahead === 0 && behind === 0) {
      return null
    }

    const content: JSX.Element[] = []
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

  private getTitle(): string {
    if (!this.props.remoteName) {
      return 'Publish repository'
    }
    if (!this.props.aheadBehind) {
      return 'Publish branch'
    }

    return getActionLabel(
      this.props.aheadBehind,
      this.props.remoteName,
      this.props.branchWasRebased,
      this.props.pullWithRebase
    )
  }

  private getIcon(): OcticonSymbol {
    if (this.props.networkActionInProgress) {
      return OcticonSymbol.sync
    }

    if (!this.props.remoteName) {
      return OcticonSymbol.cloudUpload
    }
    if (!this.props.aheadBehind) {
      return OcticonSymbol.cloudUpload
    }

    const { ahead, behind } = this.props.aheadBehind
    if (this.props.networkActionInProgress) {
      return OcticonSymbol.sync
    }

    if (this.props.branchWasRebased) {
      return forcePushIcon
    }

    if (behind > 0) {
      return OcticonSymbol.arrowDown
    }
    if (ahead > 0) {
      return OcticonSymbol.arrowUp
    }
    return OcticonSymbol.sync
  }

  private getDescription(tipState: TipState): JSX.Element | string {
    if (!this.props.remoteName) {
      return 'Publish this repository to GitHub'
    }

    if (tipState === TipState.Detached) {
      return this.props.rebaseInProgress
        ? 'Rebase in progress'
        : 'Cannot publish detached HEAD'
    }

    if (tipState === TipState.Unborn) {
      return 'Cannot publish unborn HEAD'
    }

    if (!this.props.aheadBehind) {
      const isGitHub = !!this.props.repository.gitHubRepository
      return isGitHub
        ? 'Publish this branch to GitHub'
        : 'Publish this branch to the remote'
    }

    const lastFetched = this.props.lastFetched
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

  private performAction = () => {
    const { repository, dispatcher, aheadBehind, branchWasRebased } = this.props

    if (!aheadBehind) {
      dispatcher.push(repository)
      return
    }

    const { ahead, behind } = aheadBehind

    if (isBranchRebased(branchWasRebased, aheadBehind)) {
      dispatcher.confirmOrForcePush(repository)
    } else if (behind > 0) {
      dispatcher.pull(repository)
    } else if (ahead > 0) {
      dispatcher.push(repository)
    } else {
      dispatcher.fetch(repository, FetchType.UserInitiatedTask)
    }
  }
}
