import * as React from 'react'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { RebaseConflictState } from '../../lib/app-state'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'

interface IContinueRebaseProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly rebaseConflictState: RebaseConflictState
  readonly canCommit: boolean
  readonly isCommitting: boolean
}

export class ContinueRebase extends React.Component<IContinueRebaseProps, {}> {
  private onSubmit = () => {
    this.continueRebase()
  }

  private async continueRebase() {
    if (!this.canCommit()) {
      return
    }

    this.props.dispatcher.continueRebase(
      this.props.repository,
      this.props.workingDirectory
    )
  }

  private canCommit(): boolean {
    return this.props.canCommit
  }

  private onKeyDown = (event: React.KeyboardEvent<Element>) => {
    if (event.defaultPrevented) {
      return
    }

    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (isShortcutKey && event.key === 'Enter' && this.canCommit()) {
      this.continueRebase()
      event.preventDefault()
    }
  }

  public render() {
    const { targetBranch } = this.props.rebaseConflictState

    const buttonEnabled = this.canCommit() && !this.props.isCommitting

    const loading = this.props.isCommitting ? <Loading /> : undefined

    return (
      <div
        id="commit-message"
        role="group"
        aria-label="Continue rebase"
        onKeyDown={this.onKeyDown}
      >
        <Button
          type="submit"
          className="commit-button"
          onClick={this.onSubmit}
          disabled={!buttonEnabled}
        >
          {loading}
          <span title={`Rebase ${targetBranch}`}>
            {loading ? 'Rebasing' : 'Rebase'} <strong>{targetBranch}</strong>
          </span>
        </Button>
      </div>
    )
  }
}
