import * as React from 'react'

import { Repository } from '../../models/repository'
import { TroubleshootingState, TroubleshootingStep } from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'

import { Welcome } from './welcome'
import { ValidateHost } from './validate-host'
import { UnknownAction } from './unknown-action'
import { SetupNewSSHKey } from './setup-new-ssh-key'
import { StartSSHAgent } from './start-ssh-agent'

interface ITroubleshootSSHProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly troubleshootingState: TroubleshootingState
  readonly onDismissed: () => void
}

export class TroubleshootSSH extends React.Component<
  ITroubleshootSSHProps,
  {}
> {
  public componentDidMount() {
    this.props.dispatcher.resetTroubleshooting()
  }

  public render() {
    const state = this.props.troubleshootingState
    const stepKind = state.kind

    switch (state.kind) {
      case TroubleshootingStep.WelcomeState:
        return (
          <Welcome
            dispatcher={this.props.dispatcher}
            repository={this.props.repository}
            state={state}
            onDismissed={this.props.onDismissed}
          />
        )
      case TroubleshootingStep.ValidateHost:
        return (
          <ValidateHost
            dispatcher={this.props.dispatcher}
            repository={this.props.repository}
            state={state}
            onDismissed={this.props.onDismissed}
          />
        )
      case TroubleshootingStep.NoRunningAgent:
        return (
          <StartSSHAgent
            dispatcher={this.props.dispatcher}
            state={state}
            onDismissed={this.props.onDismissed}
          />
        )
      case TroubleshootingStep.CreateSSHKey:
        return (
          <SetupNewSSHKey
            dispatcher={this.props.dispatcher}
            state={state}
            onDismissed={this.props.onDismissed}
          />
        )
      case TroubleshootingStep.Unknown:
        return (
          <UnknownAction state={state} onDismissed={this.props.onDismissed} />
        )
      default:
        return assertNever(state, `Unknown troubleshooting step: ${stepKind}`)
    }
  }
}
