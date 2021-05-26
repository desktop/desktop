import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { Repository } from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'
import { Dispatcher } from '../dispatcher'
import { ConflictState, IMultiCommitOperationState } from '../../lib/app-state'

import { MultiCommitOperationKind } from '../../models/multi-commit-operation'

import { Squash } from './squash'

interface IMultiCommitOperationManagerProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The current state of the multi commit operation */
  readonly state: IMultiCommitOperationState

  /** The current state of conflicts in the app */
  readonly conflictState: ConflictState | null

  /** The emoji map for showing commit emoji's */
  readonly emoji: Map<string, string>

  /** The current state of the working directory */
  readonly workingDirectory: WorkingDirectoryStatus

  /** Whether user should be warned about force pushing */
  readonly askForConfirmationOnForcePush: boolean

  /**
   * Callbacks for the conflict selection components to let the user jump out
   * to their preferred editor.
   */
  readonly openFileInExternalEditor: (path: string) => void
  readonly resolvedExternalEditor: string | null
  readonly openRepositoryInShell: (repository: Repository) => void
}

/** A component for initiating and performing a rebase of the current branch. */
export class MultiCommitOperationManager extends React.Component<
  IMultiCommitOperationManagerProps
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
      default:
        return assertNever(
          kind,
          `Unknown multi commit operation kind of ${kind}.`
        )
    }
  }
}
