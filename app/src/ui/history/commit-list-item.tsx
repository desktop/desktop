import * as React from 'react'
import { Commit, CommitOneLine } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { IAvatarUser, getAvatarUsersForCommit } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { getDotComAPIEndpoint } from '../../lib/api'
import { clipboard } from 'electron'
import { showContextualMenu } from '../../lib/menu-item'
import { CommitAttribution } from '../lib/commit-attribution'
import { AvatarStack } from '../lib/avatar-stack'
import { IMenuItem } from '../../lib/menu-item'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { Draggable } from '../lib/draggable'
import { enableResetToCommit } from '../../lib/feature-flag'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import {
  DragType,
  DropTargetSelector,
  DropTargetType,
} from '../../models/drag-drop'
import classNames from 'classnames'

interface ICommitProps {
  readonly gitHubRepository: GitHubRepository | null
  readonly commit: Commit
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly canBeUndone: boolean
  readonly canBeAmended: boolean
  readonly canBeResetTo: boolean
  readonly onResetToCommit?: (commit: Commit) => void
  readonly onUndoCommit?: (commit: Commit) => void
  readonly onRevertCommit?: (commit: Commit) => void
  readonly onViewCommitOnGitHub?: (sha: string) => void
  readonly onCreateBranch?: (commit: CommitOneLine) => void
  readonly onCreateTag?: (targetCommitSha: string) => void
  readonly onDeleteTag?: (tagName: string) => void
  readonly onAmendCommit?: (commit: Commit, isLocalCommit: boolean) => void
  readonly onCherryPick?: (commits: ReadonlyArray<CommitOneLine>) => void
  readonly onRenderCommitDragElement?: (commit: Commit) => void
  readonly onRemoveDragElement?: () => void
  readonly onSquash?: (
    toSquash: ReadonlyArray<Commit>,
    squashOnto: Commit,
    isInvokedByContextMenu: boolean
  ) => void
  readonly showUnpushedIndicator: boolean
  readonly unpushedIndicatorTitle?: string
  readonly unpushedTags?: ReadonlyArray<string>
  readonly isCherryPickInProgress?: boolean
  readonly disableSquashing?: boolean
}

interface ICommitListItemState {
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.PureComponent<
  ICommitProps,
  ICommitListItemState
> {
  public constructor(props: ICommitProps) {
    super(props)

    this.state = {
      avatarUsers: getAvatarUsersForCommit(
        props.gitHubRepository,
        props.commit
      ),
    }
  }

  public componentWillReceiveProps(nextProps: ICommitProps) {
    if (nextProps.commit !== this.props.commit) {
      this.setState({
        avatarUsers: getAvatarUsersForCommit(
          nextProps.gitHubRepository,
          nextProps.commit
        ),
      })
    }
  }

  private onMouseUp = () => {
    const { onSquash, selectedCommits, commit, disableSquashing } = this.props
    if (
      disableSquashing !== true &&
      dragAndDropManager.isDragOfTypeInProgress(DragType.Commit) &&
      onSquash !== undefined &&
      // don't squash if dragging one commit and dropping onto itself
      selectedCommits.filter(c => c.sha !== commit.sha).length > 0
    ) {
      onSquash(selectedCommits, commit, false)
    }
  }

  private onMouseEnter = () => {
    const { selectedCommits, commit, disableSquashing } = this.props
    const isSelected =
      selectedCommits.find(c => c.sha === commit.sha) !== undefined
    if (
      disableSquashing !== true &&
      dragAndDropManager.isDragOfTypeInProgress(DragType.Commit) &&
      !isSelected
    ) {
      dragAndDropManager.emitEnterDropTarget({
        type: DropTargetType.Commit,
      })
    }
  }

  private onMouseLeave = () => {
    if (dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      dragAndDropManager.emitLeaveDropTarget()
    }
  }

  public render() {
    const { commit } = this.props
    const {
      author: { date },
    } = commit

    const isDraggable = this.canCherryPick()
    const hasEmptySummary = commit.summary.length === 0
    const commitSummary = hasEmptySummary
      ? 'Empty commit message'
      : commit.summary

    const summaryClassNames = classNames('summary', {
      'empty-summary': hasEmptySummary,
    })

    return (
      <Draggable
        isEnabled={isDraggable}
        onDragStart={this.onDragStart}
        onRenderDragElement={this.onRenderCommitDragElement}
        onRemoveDragElement={this.onRemoveDragElement}
        dropTargetSelectors={[
          DropTargetSelector.Branch,
          DropTargetSelector.PullRequest,
          DropTargetSelector.Commit,
          DropTargetSelector.ListInsertionPoint,
        ]}
      >
        <div
          className="commit"
          onContextMenu={this.onContextMenu}
          onMouseEnter={this.onMouseEnter}
          onMouseLeave={this.onMouseLeave}
          onMouseUp={this.onMouseUp}
        >
          <div className="info">
            <RichText
              className={summaryClassNames}
              emoji={this.props.emoji}
              text={commitSummary}
              renderUrlsAsLinks={false}
            />
            <div className="description">
              <AvatarStack users={this.state.avatarUsers} />
              <div className="byline">
                <CommitAttribution
                  gitHubRepository={this.props.gitHubRepository}
                  commits={[commit]}
                />
                {renderRelativeTime(date)}
              </div>
            </div>
          </div>
          {this.renderCommitIndicators()}
        </div>
      </Draggable>
    )
  }

  private renderCommitIndicators() {
    const tagIndicator = renderCommitListItemTags(this.props.commit.tags)
    const unpushedIndicator = this.renderUnpushedIndicator()

    if (tagIndicator || unpushedIndicator) {
      return (
        <div className="commit-indicators">
          {tagIndicator}
          {unpushedIndicator}
        </div>
      )
    }

    return null
  }

  private renderUnpushedIndicator() {
    if (!this.props.showUnpushedIndicator) {
      return null
    }

    return (
      <div
        className="unpushed-indicator"
        title={this.props.unpushedIndicatorTitle}
      >
        <Octicon symbol={OcticonSymbol.arrowUp} />
      </div>
    )
  }

  private onAmendCommit = () => {
    this.props.onAmendCommit?.(this.props.commit, this.props.isLocal)
  }

  private onCopySHA = () => {
    clipboard.writeText(this.props.commit.sha)
  }

  private onViewOnGitHub = () => {
    if (this.props.onViewCommitOnGitHub) {
      this.props.onViewCommitOnGitHub(this.props.commit.sha)
    }
  }

  private onCreateTag = () => {
    if (this.props.onCreateTag) {
      this.props.onCreateTag(this.props.commit.sha)
    }
  }

  private onCherryPick = () => {
    if (this.props.onCherryPick !== undefined) {
      this.props.onCherryPick(this.props.selectedCommits)
    }
  }

  private onSquash = () => {
    if (this.props.onSquash !== undefined) {
      this.props.onSquash(this.props.selectedCommits, this.props.commit, true)
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    let items: IMenuItem[] = []
    if (this.props.selectedCommits.length > 1) {
      items = this.getContextMenuMultipleCommits()
    } else {
      items = this.getContextMenuForSingleCommit()
    }

    showContextualMenu(items)
  }

  private getContextMenuForSingleCommit(): IMenuItem[] {
    let viewOnGitHubLabel = 'View on GitHub'
    const gitHubRepository = this.props.gitHubRepository

    if (
      gitHubRepository &&
      gitHubRepository.endpoint !== getDotComAPIEndpoint()
    ) {
      viewOnGitHubLabel = 'View on GitHub Enterprise'
    }

    const items: IMenuItem[] = []

    if (this.props.canBeAmended) {
      items.push({
        label: __DARWIN__ ? 'Amend Commit…' : 'Amend commit…',
        action: this.onAmendCommit,
      })
    }

    if (this.props.canBeUndone) {
      items.push({
        label: __DARWIN__ ? 'Undo Commit…' : 'Undo commit…',
        action: () => {
          if (this.props.onUndoCommit) {
            this.props.onUndoCommit(this.props.commit)
          }
        },
        enabled: this.props.onUndoCommit !== undefined,
      })
    }

    if (enableResetToCommit()) {
      items.push({
        label: __DARWIN__ ? 'Reset to Commit…' : 'Reset to commit…',
        action: () => {
          if (this.props.onResetToCommit) {
            this.props.onResetToCommit(this.props.commit)
          }
        },
        enabled:
          this.props.canBeResetTo && this.props.onResetToCommit !== undefined,
      })
    }

    items.push(
      {
        label: __DARWIN__
          ? 'Revert Changes in Commit'
          : 'Revert changes in commit',
        action: () => {
          if (this.props.onRevertCommit) {
            this.props.onRevertCommit(this.props.commit)
          }
        },
        enabled: this.props.onRevertCommit !== undefined,
      },
      { type: 'separator' },
      {
        label: __DARWIN__
          ? 'Create Branch from Commit'
          : 'Create branch from commit',
        action: () => {
          if (this.props.onCreateBranch) {
            this.props.onCreateBranch(this.props.commit)
          }
        },
      },
      {
        label: 'Create Tag…',
        action: this.onCreateTag,
        enabled: this.props.onCreateTag !== undefined,
      }
    )

    const deleteTagsMenuItem = this.getDeleteTagsMenuItem()

    if (deleteTagsMenuItem !== null) {
      items.push(
        {
          type: 'separator',
        },
        deleteTagsMenuItem
      )
    }

    items.push(
      {
        label: __DARWIN__ ? 'Cherry-pick Commit…' : 'Cherry-pick commit…',
        action: this.onCherryPick,
        enabled: this.canCherryPick(),
      },
      { type: 'separator' },
      {
        label: 'Copy SHA',
        action: this.onCopySHA,
      },
      {
        label: viewOnGitHubLabel,
        action: this.onViewOnGitHub,
        enabled: !this.props.isLocal && !!gitHubRepository,
      }
    )

    return items
  }

  private getContextMenuMultipleCommits(): IMenuItem[] {
    const count = this.props.selectedCommits.length

    return [
      {
        label: __DARWIN__
          ? `Cherry-pick ${count} Commits…`
          : `Cherry-pick ${count} commits…`,
        action: this.onCherryPick,
        enabled: this.canCherryPick(),
      },
      {
        label: __DARWIN__
          ? `Squash ${count} Commits…`
          : `Squash ${count} commits…`,
        action: this.onSquash,
      },
    ]
  }

  private canCherryPick(): boolean {
    const { onCherryPick, isCherryPickInProgress } = this.props
    return (
      onCherryPick !== undefined &&
      this.onSquash !== undefined &&
      isCherryPickInProgress === false
      // TODO: isSquashInProgress === false
    )
  }

  private getDeleteTagsMenuItem(): IMenuItem | null {
    const { unpushedTags, onDeleteTag, commit } = this.props

    if (
      onDeleteTag === undefined ||
      unpushedTags === undefined ||
      commit.tags.length === 0
    ) {
      return null
    }

    if (commit.tags.length === 1) {
      const tagName = commit.tags[0]

      return {
        label: `Delete tag ${tagName}`,
        action: () => onDeleteTag(tagName),
        enabled: unpushedTags.includes(tagName),
      }
    }

    // Convert tags to a Set to avoid O(n^2)
    const unpushedTagsSet = new Set(unpushedTags)

    return {
      label: 'Delete tag…',
      submenu: commit.tags.map(tagName => {
        return {
          label: tagName,
          action: () => onDeleteTag(tagName),
          enabled: unpushedTagsSet.has(tagName),
        }
      }),
    }
  }

  private onDragStart = () => {
    // Removes active status from commit selection so they do not appear
    // highlighted in commit list.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    dragAndDropManager.setDragData({
      type: DragType.Commit,
      commits: this.props.selectedCommits,
    })
  }

  private onRenderCommitDragElement = () => {
    if (this.props.onRenderCommitDragElement !== undefined) {
      this.props.onRenderCommitDragElement(this.props.commit)
    }
  }

  private onRemoveDragElement = () => {
    if (this.props.onRemoveDragElement !== undefined) {
      this.props.onRemoveDragElement()
    }
  }
}

function renderRelativeTime(date: Date) {
  return (
    <>
      {` • `}
      <RelativeTime date={date} abbreviate={true} />
    </>
  )
}

function renderCommitListItemTags(tags: ReadonlyArray<string>) {
  if (tags.length === 0) {
    return null
  }
  const [firstTag] = tags
  return (
    <span className="tag-indicator">
      <span className="tag-name" key={firstTag}>
        {firstTag}
      </span>
      {tags.length > 1 && (
        <span key={tags.length} className="tag-indicator-more" />
      )}
    </span>
  )
}
