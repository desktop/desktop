import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { Squash } from './squash'
import { IMultiCommitOperationProps } from './base-multi-commit-operation'

/** A component for managing the views of a multi commit operation. */
export class MultiCommitOperation extends React.Component<
  IMultiCommitOperationProps
> {
  public render() {
    const { kind } = this.props.state.operationDetail
    switch (kind) {
      case MultiCommitOperationKind.CherryPick:
        return null
      case MultiCommitOperationKind.Rebase:
        return null
      case MultiCommitOperationKind.Squash:
        return (
          <Squash
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            state={this.props.state}
            conflictState={this.props.conflictState}
            emoji={this.props.emoji}
            workingDirectory={this.props.workingDirectory}
            askForConfirmationOnForcePush={
              this.props.askForConfirmationOnForcePush
            }
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
      case MultiCommitOperationKind.Reorder:
        return null
      default:
        return assertNever(
          kind,
          `Unknown multi commit operation kind of ${kind}.`
        )
    }
  }
}
