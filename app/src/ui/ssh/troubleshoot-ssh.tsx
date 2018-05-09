import * as React from 'react'

import { Repository } from '../../models/repository'
import { TroubleshootingState, TroubleshootingStep } from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'

import { Welcome } from './welcome'
import { ValidateHost } from './validate-host'
import { CreateSSHKey } from './create-ssh-key'
import { UnknownAction } from './unknown-action'
import { ChooseAccount } from './choose-account'

interface ITroubleshootSSHProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly troubleshootingState: TroubleshootingState
  readonly onDismissed: () => void
}

interface ITroubleshootSSHState {
  readonly selectedAccounts: ReadonlyArray<number>
}

export class TroubleshootSSH extends React.Component<
  ITroubleshootSSHProps,
  ITroubleshootSSHState
> {
  public constructor(props: ITroubleshootSSHProps) {
    super(props)

    this.state = {
      selectedAccounts: [],
    }
  }

  public componentDidMount() {
    this.props.dispatcher.resetTroubleshooting()
  }

  private onAccountSelectionChanged = (
    selectedAccounts: ReadonlyArray<number>
  ) => {
    const state = this.props.troubleshootingState
    if (state.kind !== TroubleshootingStep.ChooseAccount) {
      return
    }

    this.setState({ selectedAccounts })
  }

  private onRowClick = (row: number) => {
    const state = this.props.troubleshootingState
    if (state.kind !== TroubleshootingStep.ChooseAccount) {
      return
    }

    this.setState({ selectedAccounts: [row] })
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
      case TroubleshootingStep.ChooseAccount:
        return (
          <ChooseAccount
            accounts={state.accounts}
            selectedAccounts={this.state.selectedAccounts}
            onDismissed={this.props.onDismissed}
            onAccountSelectionChanged={this.onAccountSelectionChanged}
            onRowClick={this.onRowClick}
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
