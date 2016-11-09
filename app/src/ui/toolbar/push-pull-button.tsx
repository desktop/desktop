import * as React from 'react'
import * as moment from 'moment'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { IAheadBehind } from '../../lib/app-state'
import { Dispatcher } from '../../lib/dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'

interface IPushPullButtonProps {
  /** The ahead/behind count for the current branch. */
  readonly aheadBehind: IAheadBehind

  /** The name of the remote. */
  readonly remoteName: string | null

  /** Is a push/pull/update in progress? */
  readonly networkActionInProgress: boolean

  /** The date of the last fetch. */
  readonly lastFetched: Date | null

  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

/**
 * A button which pushes, pulls, or updates depending on the state of the
 * repository.
 */
export class PushPullButton extends React.Component<IPushPullButtonProps, void> {
  public render() {
    return (
      <ToolbarButton
        title={this.getTitle()}
        description={this.getDescription()}
        icon={this.getIcon()}
        iconClassName={this.props.networkActionInProgress ? 'spin' : ''}
        onClick={() => this.performAction()}
        style={ToolbarButtonStyle.Subtitle}>
        {this.renderAheadBehind()}
      </ToolbarButton>
    )
  }

  private renderAheadBehind() {
    const { ahead, behind } = this.props.aheadBehind
    if (ahead === 0 && behind === 0) { return null }

    const content: JSX.Element[] = []
    if (ahead > 0) {
      content.push(
        <span key='ahead'>
          {ahead}
          <Octicon symbol={OcticonSymbol.arrowUp}/>
        </span>
      )
    }

    if (behind > 0) {
      content.push(
        <span key='behind'>
          {behind}
          <Octicon symbol={OcticonSymbol.arrowDown}/>
        </span>
      )
    }

    return <div className='ahead-behind'>{content}</div>
  }

  private getTitle(): string {
    const { ahead, behind } = this.props.aheadBehind
    const actionName = (function () {
      if (behind > 0) { return 'Pull' }
      if (ahead > 0) { return 'Push' }
      return 'Update'
    })()

    return this.props.remoteName ? `${actionName} ${this.props.remoteName}` : actionName
  }

  private getIcon(): OcticonSymbol {
    const { ahead, behind } = this.props.aheadBehind
    if (this.props.networkActionInProgress) { return OcticonSymbol.sync }
    if (behind > 0) { return OcticonSymbol.arrowDown }
    if (ahead > 0) { return OcticonSymbol.arrowUp }
    return OcticonSymbol.sync
  }

  private getDescription(): string {
    const lastFetched = this.props.lastFetched
    if (lastFetched) {
      const relative = moment(lastFetched).fromNow()
      return `Last fetched ${relative}`
    } else {
      return 'Never fetched'
    }
  }

  private performAction() {
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
