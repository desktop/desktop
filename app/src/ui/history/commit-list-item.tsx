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
import classNames from 'classnames'

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
  readonly openBranchDropdown?: () => void
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
    const {
      commit,
      selectedCommits: { length: count },
    } = this.props
    const {
      author: { date },
    } = commit

    const className = classNames('commit', { 'multiple-selected': count > 1 })
    return (
      <div
        className={className}
        onContextMenu={this.onContextMenu}
        onMouseDown={this.onMouseDown}
      >
        <div className="commit-box">
          <div className="count">{count}</div>
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
          {this.renderDragCopyLabel(count)}
        </div>
      </div>
    )
  }

  private renderDragCopyLabel(count: number) {
    if (__DARWIN__) {
      return
    }

    return (
      <div className="copy-message-label">
        <div>
          <Octicon symbol={OcticonSymbol.plus} />
          Copy to <span className="branch-name">branch</span>
        </div>
      </div>
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
        label: __DARWIN__ ? 'Cherry Pick Commit…' : 'Cherry pick commit…',
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
          ? `Cherry Pick ${count} Commits…`
          : `Cherry pick ${count} commits…`,
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

  private canDragCommit(event: React.MouseEvent<HTMLDivElement>): boolean {
    // right clicks (context menu) or shift clicks (range selection)
    const isSpecialClick =
      event.button === 2 ||
      (__DARWIN__ && event.button === 0 && event.ctrlKey) ||
      event.shiftKey

    const dragHandlerExists = this.props.onDragStart !== undefined
    return !isSpecialClick && dragHandlerExists && this.canCherryPick()
  }

  /**
   * Method to handle invoking a commit being dragged.
   */
  private onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!this.canDragCommit(event)) {
      return
    }

    const ghost = this.buildCommitDragGhost(event)
    this.trackCommitDrag(ghost)
  }

  /**
   * Builds a commit drag ghost by cloning the existing commit
   */
  private buildCommitDragGhost(
    event: React.MouseEvent<HTMLDivElement>
  ): HTMLDivElement {
    const ghost = event.currentTarget.cloneNode(true) as HTMLDivElement
    ghost.style.width = event.currentTarget.clientWidth + 'px'
    ghost.id = 'commit-ghost'
    return ghost
  }

  /**
   * Setups the adding and removing of the mouse move event handler in order to
   * make the ghost follow the mouse and be removed from the dom when drag is
   * over.
   *
   * It also tracks whether the commit is dragged over the branch dropdown in
   * order to open it and whether the commit is over the branch when mouse up
   * occurs in order to clear cherry picking state on drag end if it is not over
   * a branch.
   *
   * Note: This has document event handlers and dom queries not scoped to this
   * component and currently depends on html elements (#desktop-app-contents,
   * .branch-button, .branches-list-item, .name) not in this component making it
   * susceptible to impact if those components were to change.
   *
   * Note: We attempted to use the more generic document.body as opposed to
   * #desktop-app-contents, but something with electron/react makes it so
   * anything appended outside the app is not accessible.
   */
  private trackCommitDrag(ghost: HTMLDivElement) {
    const desktopAppContainer = document.getElementById('desktop-app-contents')
    if (desktopAppContainer === null) {
      log.warn('[onCommitMouseDown] - Could not locate desktop container!')
      return
    }

    const { onDragStart, openBranchDropdown, selectedCommits } = this.props
    let branchListItem: Element | null = null
    let dragStarted = false
    const copyMessageLabelElement = ghost.querySelector(
      '.copy-message-label .branch-name'
    )

    // This is housed inside the trackCommitDrag method so we have its reference
    // for removing the event listener. We could move it out but, then we would
    // have move a lot of tracking out to the commit class and prefer to
    // encapsulate all the non-react way of handling the drag event in one spot.
    // If we make more things draggable, it may be prudent to refactor this into
    // a draggable component.
    function onMouseMove(moveEvent: MouseEvent) {
      // Wait till user actually moves their mouse as opposed to clicking it.
      if (!dragStarted && desktopAppContainer !== null) {
        if (onDragStart !== undefined) {
          onDragStart(selectedCommits)
        }

        desktopAppContainer.appendChild(ghost)
        desktopAppContainer.classList.add('cherry-pick-mouse-over')
        dragStarted = true

        // Removes active status from commit selection
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }

      // place ghost next to mouse
      const verticalOffset = __DARWIN__ ? 32 : 15
      ghost.style.left = moveEvent.pageX + 0 + 'px'
      ghost.style.top = moveEvent.pageY + verticalOffset + 'px'

      // inspect element mouse is is hovering over
      const elemBelow = document.elementFromPoint(
        moveEvent.clientX,
        moveEvent.clientY
      )

      // mouse left the screen
      if (elemBelow === null) {
        return
      }

      const branchDropdown = elemBelow.closest('.branch-button')
      branchListItem = elemBelow.closest('.branches-list-item')

      // We must be over the branch drop down button.
      if (branchDropdown !== null) {
        if (openBranchDropdown) {
          openBranchDropdown()
        }
      }

      // We must be over a branch.
      if (branchListItem !== null) {
        ghost.classList.add('over-branch')
        // Grabbing branch name for copy label on windows implementation
        const branchNameElement = branchListItem.querySelector('.name')
        if (branchNameElement !== null && copyMessageLabelElement) {
          copyMessageLabelElement.innerHTML = branchNameElement.innerHTML
        }
      } else if (branchListItem == null) {
        // We must have just left a branch.
        ghost.classList.remove('over-branch')
        if (copyMessageLabelElement) {
          copyMessageLabelElement.innerHTML = 'branch'
        }
      }
    }

    document.addEventListener('mousemove', onMouseMove)

    document.onmouseup = e => {
      document.removeEventListener('mousemove', onMouseMove)
      desktopAppContainer.classList.remove('cherry-pick-mouse-over')
      document.onmouseup = null
      ghost.remove()
      const clearCherryPickingState = branchListItem === null
      this.onDragEnd(clearCherryPickingState)
    }
  }

  private onDragEnd = (clearCherryPickingState: boolean): void => {
    if (this.props.onDragEnd !== undefined) {
      this.props.onDragEnd(clearCherryPickingState)
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
