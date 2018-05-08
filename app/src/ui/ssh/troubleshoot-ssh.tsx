import * as React from 'react'

import { Repository } from '../../models/repository'
import { TroubleshootingState, TroubleshootingStep } from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'

import { Welcome } from './welcome'
import { ValidateHost } from './validate-host'
import { CreateSSHKey } from './create-ssh-key'
import { UnknownAction } from './unknown-action'

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
      case TroubleshootingStep.InitialState:
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
      case TroubleshootingStep.CreateSSHKey:
        return (
          <CreateSSHKey
            initialPath={state.initialPath}
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
