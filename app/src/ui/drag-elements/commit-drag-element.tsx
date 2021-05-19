import classNames from 'classnames'
import * as React from 'react'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { assertNever } from '../../lib/fatal-error'
import { Commit } from '../../models/commit'
import { DropTarget, DropTargetType } from '../../models/drag-drop'
import { GitHubRepository } from '../../models/github-repository'
import { CommitListItem } from '../history/commit-list-item'
import { Octicon, OcticonSymbol } from '../octicons'

interface ICommitDragElementProps {
  readonly commit: Commit
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly gitHubRepository: GitHubRepository | null
  readonly emoji: Map<string, string>
}

interface ICommitDragElementState {
  readonly showTooltip: boolean
  readonly currentDropTarget: DropTarget | null
}

export class CommitDragElement extends React.Component<
  ICommitDragElementProps,
  ICommitDragElementState
> {
  private timeoutId: number | null = null

  public constructor(props: ICommitDragElementProps) {
    super(props)
    this.state = {
      showTooltip: false,
      currentDropTarget: null,
    }

    dragAndDropManager.onEnterDropTarget(dropTarget => {
      this.setState({ currentDropTarget: dropTarget })
      switch (dropTarget.type) {
        case DropTargetType.Branch:
          this.setToolTipTimer(1500)
          break
        case DropTargetType.Commit:
          this.setState({ showTooltip: true })
          break
        default:
          assertNever(dropTarget, `Unknown drop target type: ${dropTarget}`)
      }
    })

    dragAndDropManager.onLeaveDropTarget(() => {
      this.setState({ currentDropTarget: null, showTooltip: false })
    })
  }

  private setToolTipTimer(time: number) {
    if (__DARWIN__) {
      // For macOs, we styled the copy to message to look like a native tool tip
      // that appears when hovering over a element with the title attribute. We
      // also are implementing this timeout to have similar hover-to-see feel.
      this.setState({ showTooltip: false })

      if (this.timeoutId !== null) {
        window.clearTimeout(this.timeoutId)
      }

      this.timeoutId = window.setTimeout(
        () => this.setState({ showTooltip: true }),
        time
      )
    } else {
      this.setState({ showTooltip: true })
    }
  }

  private renderDragToolTip() {
    const { showTooltip, currentDropTarget } = this.state
    if (!showTooltip || currentDropTarget === null) {
      return
    }

    let toolTipContents
    switch (currentDropTarget.type) {
      case DropTargetType.Branch:
        const copyToPlus = __DARWIN__ ? null : (
          <Octicon symbol={OcticonSymbol.plus} />
        )
        toolTipContents = (
          <>
            {copyToPlus}
            <span>
              Copy to{' '}
              <span className="branch-name">
                {currentDropTarget.branchName}
              </span>
            </span>
          </>
        )
        break
      case DropTargetType.Commit:
        toolTipContents = (
          <>
            <span>Squash {this.props.selectedCommits.length + 1} commits</span>
          </>
        )
        break
      default:
        assertNever(
          currentDropTarget,
          `Unknown drop target type: ${currentDropTarget}`
        )
    }

    return (
      <div className="tool-tip-contents">
        <div>{toolTipContents}</div>
      </div>
    )
  }

  public render() {
    const { commit, gitHubRepository, selectedCommits, emoji } = this.props
    const count = selectedCommits.length

    const className = classNames({ 'multiple-selected': count > 1 })
    return (
      <div id="commit-drag-element" className={className}>
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
        {this.renderDragToolTip()}
      </div>
    )
  }
}
