import classNames from 'classnames'
import { Disposable } from 'event-kit'
import * as React from 'react'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { assertNever } from '../../lib/fatal-error'
import { Commit } from '../../models/commit'
import { DragType, DropTarget, DropTargetType } from '../../models/drag-drop'
import { GitHubRepository } from '../../models/github-repository'
import { CommitListItem } from '../history/commit-list-item'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

interface ICommitDragElementProps {
  readonly commit: Commit
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly gitHubRepository: GitHubRepository | null
  /**
   * Whether or not this is shown for a keyboard-based insertion (like reordering
   * commits). Optional. Default: false
   */
  readonly isKeyboardInsertion?: boolean
  readonly emoji: Map<string, Emoji>
  readonly accounts: ReadonlyArray<Account>
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
  private onEnterDropTarget: Disposable | null = null
  private onLeaveDropTargetDisposable: Disposable | null = null

  public constructor(props: ICommitDragElementProps) {
    super(props)
    this.state = {
      showTooltip: false,
      currentDropTarget: null,
    }
  }

  private clearTimeout() {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId)
    }
  }

  private setToolTipTimer(time: number) {
    if (__DARWIN__) {
      // For macOs, we styled the copy to message to look like a native tool tip
      // that appears when hovering over a element with the title attribute. We
      // also are implementing this timeout to have similar hover-to-see feel.
      this.setState({ showTooltip: false })

      this.clearTimeout()

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
          <Octicon className="copy-to-icon" symbol={octicons.plus} />
        )
        toolTipContents = (
          <>
            {copyToPlus}
            <span>
              <span className="copy-to">Copy to</span>
              <span className="branch-name">
                {currentDropTarget.branchName}
              </span>
            </span>
          </>
        )
        break
      case DropTargetType.Commit:
        // Selected commits (being dragged) + the one commit it is squashed (dropped) on.
        const commitsBeingSquashedCount = this.props.selectedCommits.length + 1
        toolTipContents = (
          <>
            <span>Squash {commitsBeingSquashedCount} commits</span>
          </>
        )
        break
      case DropTargetType.ListInsertionPoint:
        if (currentDropTarget.data.type !== DragType.Commit) {
          toolTipContents = (
            <>
              <span>'Insert here'</span>
            </>
          )
          break
        }

        const pluralized =
          currentDropTarget.data.commits.length === 1 ? 'commit' : 'commits'
        toolTipContents = (
          <>
            <span>{`Move ${pluralized} here`}</span>
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

  public componentDidMount() {
    this.onEnterDropTarget = dragAndDropManager.onEnterDropTarget(
      dropTarget => {
        this.setState({ currentDropTarget: dropTarget })
        switch (dropTarget.type) {
          case DropTargetType.Branch:
          case DropTargetType.Commit:
          case DropTargetType.ListInsertionPoint:
            this.setToolTipTimer(1500)
            break
          default:
            assertNever(dropTarget, `Unknown drop target type: ${dropTarget}`)
        }
      }
    )

    this.onLeaveDropTargetDisposable = dragAndDropManager.onLeaveDropTarget(
      () => {
        this.setState({ currentDropTarget: null, showTooltip: false })
      }
    )
  }

  public componentWillUnmount() {
    this.clearTimeout()

    if (this.onEnterDropTarget !== null) {
      this.onEnterDropTarget.dispose()
      this.onEnterDropTarget = null
    }

    if (this.onLeaveDropTargetDisposable !== null) {
      this.onLeaveDropTargetDisposable.dispose()
      this.onLeaveDropTargetDisposable = null
    }
  }

  public render() {
    const { commit, gitHubRepository, selectedCommits, emoji } = this.props
    const count = selectedCommits.length

    const className = classNames({
      'multiple-selected': count > 1,
      'in-keyboard-insertion-mode': this.props.isKeyboardInsertion ?? false,
    })
    return (
      <div id="commit-drag-element" className={className}>
        <div className="commit-box">
          <div className="count">{count}</div>
          <CommitListItem
            gitHubRepository={gitHubRepository}
            commit={commit}
            selectedCommits={selectedCommits}
            emoji={emoji}
            showUnpushedIndicator={false}
            accounts={this.props.accounts}
          />
        </div>
        {this.renderDragToolTip()}
      </div>
    )
  }
}
