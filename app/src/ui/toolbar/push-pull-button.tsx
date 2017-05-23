import * as React from 'react'
import { ToolbarButton } from './button'
import { ToolbarButtonStyle } from './button'
import { IAheadBehind } from '../../lib/app-state'
import { Dispatcher } from '../../lib/dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { RelativeTime } from '../relative-time'
import { Progress } from '../../lib/app-state'

interface IPushPullButtonProps {
  /**
   * The ahead/behind count for the current branch. If null, it indicates the
   * branch doesn't have an upstream.
   */
  readonly aheadBehind: IAheadBehind | null

  /** The name of the remote. */
  readonly remoteName: string | null

  /** Is a push/pull/update in progress? */
  readonly networkActionInProgress: boolean

  /** The date of the last fetch. */
  readonly lastFetched: Date | null

  readonly progress: Progress | null

  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

/**
 * A button which pushes, pulls, or updates depending on the state of the
 * repository.
 */
export class PushPullButton extends React.Component<IPushPullButtonProps, void> {
  public render() {

    const progress = this.props.progress

    const title = progress ? progress.title : this.getTitle()

    const description = progress
      ? progress.description || 'Hang on…'
      : this.getDescription()

    const progressValue = progress
      ? progress.value
      : undefined

    const disabled = this.props.networkActionInProgress || !!this.props.progress

    return (
      <ToolbarButton
        title={title}
        description={description}
        progressValue={progressValue}
        className='push-pull-button'
        icon={this.getIcon()}
        iconClassName={this.props.networkActionInProgress ? 'spin' : ''}
        style={ToolbarButtonStyle.Subtitle}
        onClick={this.performAction}
        disabled={disabled}>
        {this.renderAheadBehind()}
      </ToolbarButton>
    )
  }

  private renderAheadBehind() {
    if (!this.props.aheadBehind || this.props.progress) {
      return null
    }

    const { ahead, behind } = this.props.aheadBehind
    if (ahead === 0 && behind === 0) { return null }

    const content: JSX.Element[] = []
    if (ahead > 0) {
      content.push(
        <span key='ahead'>
          {ahead}
          <Octicon symbol={OcticonSymbol.arrowSmallUp}/>
        </span>)
    }

    if (behind > 0) {
      content.push(
        <span key='behind'>
          {behind}
          <Octicon symbol={OcticonSymbol.arrowSmallDown}/>
        </span>)
    }

    return <div className='ahead-behind'>{content}</div>
  }

  private getTitle(): string {
    if (!this.props.remoteName) { return 'Publish repository' }
    if (!this.props.aheadBehind) { return 'Publish branch' }

    const { ahead, behind } = this.props.aheadBehind
    const actionName = (function () {
      if (behind > 0) { return 'Pull' }
      if (ahead > 0) { return 'Push' }
      return 'Fetch'
    })()

    return `${actionName} ${this.props.remoteName}`
  }

  private getIcon(): OcticonSymbol {

    if (this.props.networkActionInProgress) {
      return OcticonSymbol.sync
    }

    if (!this.props.remoteName) { return OcticonSymbol.cloudUpload }
    if (!this.props.aheadBehind) { return OcticonSymbol.cloudUpload }

    const { ahead, behind } = this.props.aheadBehind
    if (this.props.networkActionInProgress) { return OcticonSymbol.sync }
    if (behind > 0) { return OcticonSymbol.arrowDown }
    if (ahead > 0) { return OcticonSymbol.arrowUp }
    return OcticonSymbol.sync
  }

  private getDescription(): JSX.Element | string {
    if (!this.props.remoteName) { return 'Publish this repository to GitHub' }
    if (!this.props.aheadBehind) { return 'Publish this branch to GitHub' }

    const lastFetched = this.props.lastFetched
    if (lastFetched) {
      return <span>Last fetched <RelativeTime date={lastFetched} /></span>
    } else {
      return 'Never fetched'
    }
  }

  private performAction = () => {
    if (!this.props.aheadBehind) {
      this.props.dispatcher.push(this.props.repository)
      return
    }

    const { ahead, behind } = this.props.aheadBehind
    if (behind > 0) {
      this.props.dispatcher.pull(this.props.repository)
    } else if (ahead > 0) {
      this.props.dispatcher.push(this.props.repository)
    } else {
      this.props.dispatcher.fetch(this.props.repository)
    }
  }
}
