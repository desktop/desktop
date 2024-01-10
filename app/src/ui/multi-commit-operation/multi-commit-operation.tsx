import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { Squash } from './squash'
import { IMultiCommitOperationProps } from './base-multi-commit-operation'
import { Merge } from './merge'
import { Reorder } from './reorder'
import { CherryPick } from './cherry-pick'
import { Rebase } from './rebase'

/** A component for managing the views of a multi commit operation. */
export class MultiCommitOperation extends React.Component<IMultiCommitOperationProps> {
  public render() {
    const { kind } = this.props.state.operationDetail
    switch (kind) {
      case MultiCommitOperationKind.CherryPick:
        return <CherryPick {...this.props} />
      case MultiCommitOperationKind.Rebase:
        return <Rebase {...this.props} />
      case MultiCommitOperationKind.Merge:
        return (
          <Merge
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            state={this.props.state}
            conflictState={this.props.conflictState}
            emoji={this.props.emoji}
            workingDirectory={this.props.workingDirectory}
            askForConfirmationOnForcePush={
              this.props.askForConfirmationOnForcePush
            }
            accounts={this.props.accounts}
            cachedRepoRulesets={this.props.cachedRepoRulesets}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
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
            accounts={this.props.accounts}
            cachedRepoRulesets={this.props.cachedRepoRulesets}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
      case MultiCommitOperationKind.Reorder:
        return (
          <Reorder
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            state={this.props.state}
            conflictState={this.props.conflictState}
            emoji={this.props.emoji}
            workingDirectory={this.props.workingDirectory}
            askForConfirmationOnForcePush={
              this.props.askForConfirmationOnForcePush
            }
            accounts={this.props.accounts}
            cachedRepoRulesets={this.props.cachedRepoRulesets}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
      default:
        return assertNever(
          kind,
          `Unknown multi commit operation kind of ${kind}.`
        )
    }
  }
}
