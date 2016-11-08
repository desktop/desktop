import * as React from 'react'
import { ToolbarButton } from './button'
import { IAheadBehind } from '../../lib/app-state'
import { Dispatcher } from '../../lib/dispatcher'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'

interface IPushPullButtonProps {
  readonly aheadBehind: IAheadBehind
  readonly remoteName: string | null
  readonly networkActionInProgress: boolean
  readonly lastFetched: Date
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

export class PushPullButton extends React.Component<IPushPullButtonProps, void> {
  public render() {
    return <ToolbarButton
      title={this.getTitle()}
      description={this.getDescription()}
      icon={this.getIcon()}
      iconClassName={this.props.networkActionInProgress ? 'spin' : ''}
      onClick={() => this.performAction()}/>
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
    const { ahead, behind } = this.props.aheadBehind
     return `${ahead} ahead, ${behind} behind`
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
