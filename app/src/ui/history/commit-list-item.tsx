import * as React from 'react'
import { Commit, CommitOneLine } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { IAvatarUser, getAvatarUsersForCommit } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { getDotComAPIEndpoint } from '../../lib/api'
import { clipboard } from 'electron'
import { showContextualMenu } from '../main-process-proxy'
import { CommitAttribution } from '../lib/commit-attribution'
import { AvatarStack } from '../lib/avatar-stack'
import { IMenuItem } from '../../lib/menu-item'
import { Octicon, OcticonSymbol } from '../octicons'
import {
  enableGitTagsDisplay,
  enableGitTagsCreation,
  enableCherryPicking,
} from '../../lib/feature-flag'
import { Draggable } from '../lib/draggable'

interface ICommitProps {
  readonly gitHubRepository: GitHubRepository | null
  readonly commit: Commit
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly onRevertCommit?: (commit: Commit) => void
  readonly onViewCommitOnGitHub?: (sha: string) => void
  readonly onCreateTag?: (targetCommitSha: string) => void
  readonly onDeleteTag?: (tagName: string) => void
  readonly onCherryPick?: (commits: ReadonlyArray<CommitOneLine>) => void
  readonly onDragStart?: (commits: ReadonlyArray<CommitOneLine>) => void
  readonly onDragEnd?: (clearCherryPickingState: boolean) => void
  readonly onRenderCherryPickCommitDragElement?: (commit: Commit) => void
  readonly onRemoveCherryPickDragElement?: () => void
  readonly showUnpushedIndicator: boolean
  readonly unpushedIndicatorTitle?: string
  readonly unpushedTags?: ReadonlyArray<string>
  readonly isCherryPickInProgress?: boolean
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

  public render() {
    const { commit } = this.props
    const {
      author: { date },
    } = commit

    const dragHandlerExists = this.props.onDragStart !== undefined
    const isDraggable = dragHandlerExists && this.canCherryPick()

    return (
      <Draggable
        isEnabled={isDraggable}
        onDragStart={this.onDragStart}
        onDragEnd={this.onDragEnd}
        onRenderDragElement={this.onRenderCherryPickCommitDragElement}
        onRemoveDragElement={this.onRemoveDragElement}
        dropTargetSelectors={['.branches-list-item']}
      >
        <div className="commit" onContextMenu={this.onContextMenu}>
          <div className="info">
            <RichText
              className="summary"
              emoji={this.props.emoji}
              text={commit.summary}
              renderUrlsAsLinks={false}
            />
            <div className="description">
              <AvatarStack users={this.state.avatarUsers} />
              <div className="byline">
                <CommitAttribution
                  gitHubRepository={this.props.gitHubRepository}
                  commit={commit}
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
    const tagIndicator = enableGitTagsDisplay()
      ? renderCommitListItemTags(this.props.commit.tags)
      : null

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

    const items: IMenuItem[] = [
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
    ]

    if (enableGitTagsCreation()) {
      items.push({
        label: 'Create Tag…',
        action: this.onCreateTag,
        enabled: this.props.onCreateTag !== undefined,
      })

      const deleteTagsMenuItem = this.getDeleteTagsMenuItem()

      if (deleteTagsMenuItem !== null) {
        items.push(
          {
            type: 'separator',
          },
          deleteTagsMenuItem
        )
      }
    }

    if (enableCherryPicking()) {
      items.push({
        label: __DARWIN__ ? 'Cherry-pick Commit…' : 'Cherry-pick commit…',
        action: this.onCherryPick,
        enabled: this.canCherryPick(),
      })
    }

    items.push(
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
    const items: IMenuItem[] = []

    const count = this.props.selectedCommits.length
    if (enableCherryPicking()) {
      items.push({
        label: __DARWIN__
          ? `Cherry-pick ${count} Commits…`
          : `Cherry-pick ${count} commits…`,
        action: this.onCherryPick,
        enabled: this.canCherryPick(),
      })
    }

    return items
  }

  private canCherryPick(): boolean {
    const { onCherryPick, isCherryPickInProgress } = this.props
    return (
      onCherryPick !== undefined &&
      isCherryPickInProgress === false &&
      enableCherryPicking()
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

    if (this.props.onDragStart !== undefined) {
      this.props.onDragStart(this.props.selectedCommits)
    }
  }

  private onDragEnd = (isOverDragTarget: boolean): void => {
    if (this.props.onDragEnd !== undefined) {
      this.props.onDragEnd(!isOverDragTarget)
    }
  }

  private onRenderCherryPickCommitDragElement = () => {
    if (this.props.onRenderCherryPickCommitDragElement !== undefined) {
      this.props.onRenderCherryPickCommitDragElement(this.props.commit)
    }
  }

  private onRemoveDragElement = () => {
    if (this.props.onRemoveCherryPickDragElement !== undefined) {
      this.props.onRemoveCherryPickDragElement()
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
