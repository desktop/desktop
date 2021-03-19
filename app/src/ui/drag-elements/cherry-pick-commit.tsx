import classNames from 'classnames'
import * as React from 'react'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { Commit } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { CommitListItem } from '../history/commit-list-item'
import { Octicon, OcticonSymbol } from '../octicons'

interface ICherryPickCommitProps {
  readonly commit: Commit
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly gitHubRepository: GitHubRepository | null
  readonly emoji: Map<string, string>
}

interface ICherryPickCommitState {
  readonly branchName: string | null
}

export class CherryPickCommit extends React.Component<
  ICherryPickCommitProps,
  ICherryPickCommitState
> {
  public constructor(props: ICherryPickCommitProps) {
    super(props)
    this.state = {
      branchName: null,
    }

    dragAndDropManager.onEnterDropTarget(targetDescription => {
      this.setState({ branchName: targetDescription })
    })

    dragAndDropManager.onLeaveDropTarget(() => {
      this.setState({ branchName: null })
    })
  }

  /**
   * The "copy to" label is a windows convention we are implementing to provide
   * a more intuitive ux for windows users.
   */
  private renderDragCopyLabel(count: number) {
    const { branchName } = this.state
    if (branchName === null || __DARWIN__) {
      return
    }

    return (
      <div className="copy-message-label">
        <div>
          <Octicon symbol={OcticonSymbol.plus} />
          Copy to <span className="branch-name">{branchName}</span>
        </div>
      </div>
    )
  }

  public render() {
    const { commit, gitHubRepository, selectedCommits, emoji } = this.props
    const count = selectedCommits.length

    const className = classNames({ 'multiple-selected': count > 1 })
    return (
      <div id="cherry-pick-commit-drag-element" className={className}>
        <div className="commit-box">
          <div className="count">{count}</div>
          <CommitListItem
            gitHubRepository={gitHubRepository}
            commit={commit}
            selectedCommits={selectedCommits}
            emoji={emoji}
            isLocal={false}
            showUnpushedIndicator={false}
          />
        </div>
        {this.renderDragCopyLabel(count)}
      </div>
    )
  }
}
