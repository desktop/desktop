import * as React from 'react'
import classNames from 'classnames'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RichText } from '../lib/rich-text'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { getAvatarUsersForCommit, IAvatarUser } from '../../models/avatar'
import { AvatarStack } from '../lib/avatar-stack'
import { CommitAttribution } from '../lib/commit-attribution'
import { Tokenizer, TokenResult } from '../../lib/text-token-parser'
import { wrapRichTextCommitMessage } from '../../lib/wrap-rich-text-commit-message'
import { DiffOptions } from '../diff/diff-options'
import { IChangesetData } from '../../lib/git'
import { TooltippedContent } from '../lib/tooltipped-content'
import { AppFileStatusKind } from '../../models/status'
import uniqWith from 'lodash/uniqWith'
import { LinkButton } from '../lib/link-button'
import { UnreachableCommitsTab } from './unreachable-commits-dialog'
import { TooltippedCommitSHA } from '../lib/tooltipped-commit-sha'
import memoizeOne from 'memoize-one'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

interface ICommitSummaryProps {
  readonly repository: Repository
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly shasInDiff: ReadonlyArray<string>
  readonly changesetData: IChangesetData
  readonly emoji: Map<string, Emoji>

  /**
   * Whether or not the commit body container should
   * be rendered expanded or not. In expanded mode the
   * commit body container takes over the diff view
   * allowing for full height, scrollable reading of
   * the commit message body.
   */
  readonly isExpanded: boolean

  readonly onExpandChanged: (isExpanded: boolean) => void

  readonly onDescriptionBottomChanged: (descriptionBottom: number) => void

  readonly hideDescriptionBorder: boolean

  readonly hideWhitespaceInDiff: boolean

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => Promise<void>

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void

  /** Called to highlight certain shas in the history */
  readonly onHighlightShas: (shasToHighlight: ReadonlyArray<string>) => void

  /** Called to show unreachable commits dialog */
  readonly showUnreachableCommits: (tab: UnreachableCommitsTab) => void

  readonly accounts: ReadonlyArray<Account>
}

interface ICommitSummaryState {
  /**
   * The commit message summary, i.e. the first line in the commit message.
   * Note that this may differ from the body property in the commit object
   * passed through props, see the createState method for more details.
   */
  readonly summary: ReadonlyArray<TokenResult>

  /**
   * Whether the commit summary was empty.
   */
  readonly hasEmptySummary: boolean

  /**
   * The commit message body, i.e. anything after the first line of text in the
   * commit message. Note that this may differ from the body property in the
   * commit object passed through props, see the createState method for more
   * details.
   */
  readonly body: ReadonlyArray<TokenResult>

  /**
   * Whether or not the commit body text overflows its container. Used in
   * conjunction with the isExpanded prop.
   */
  readonly isOverflowed: boolean

  /**
   * The avatars associated with this commit. Used when rendering
   * the avatar stack and calculated whenever the commit prop changes.
   */
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
}

/**
 * Creates the state object for the CommitSummary component.
 *
 * Ensures that the commit summary never exceeds 72 characters and wraps it
 * into the commit body if it does.
 *
 * @param isOverflowed Whether or not the component should render the commit
 *                     body in expanded mode, see the documentation for the
 *                     isOverflowed state property.
 *
 * @param props        The current commit summary prop object.
 */
function createState(
  isOverflowed: boolean,
  props: ICommitSummaryProps
): ICommitSummaryState {
  const { emoji, repository, selectedCommits } = props
  const tokenizer = new Tokenizer(emoji, repository)

  const { summary, body } = wrapRichTextCommitMessage(
    getCommitSummary(selectedCommits),
    selectedCommits[0].body,
    tokenizer
  )

  const hasEmptySummary =
    selectedCommits.length === 1 && selectedCommits[0].summary.length === 0

  const allAvatarUsers = selectedCommits.flatMap(c =>
    getAvatarUsersForCommit(repository.gitHubRepository, c)
  )

  const avatarUsers = uniqWith(
    allAvatarUsers,
    (a, b) => a.email === b.email && a.name === b.name
  )

  return { isOverflowed, summary, body, avatarUsers, hasEmptySummary }
}

function getCommitSummary(selectedCommits: ReadonlyArray<Commit>) {
  return selectedCommits[0].summary.length === 0
    ? 'Empty commit message'
    : selectedCommits[0].summary
}

/**
 * Helper function which determines if two commit objects
 * have the same commit summary and body.
 */
function messageEquals(x: Commit, y: Commit) {
  return x.summary === y.summary && x.body === y.body
}

export class CommitSummary extends React.Component<
  ICommitSummaryProps,
  ICommitSummaryState
> {
  private descriptionScrollViewRef: HTMLDivElement | null = null
  private readonly resizeObserver: ResizeObserver | null = null
  private updateOverflowTimeoutId: NodeJS.Immediate | null = null
  private descriptionRef: HTMLDivElement | null = null

  private getCountCommitsNotInDiff = memoizeOne(
    (
      selectedCommits: ReadonlyArray<Commit>,
      shasInDiff: ReadonlyArray<string>
    ) => {
      if (selectedCommits.length === 1) {
        return 0
      } else {
        const shas = new Set(shasInDiff)
        return selectedCommits.reduce(
          (acc, c) => acc + (shas.has(c.sha) ? 0 : 1),
          0
        )
      }
    }
  )

  public constructor(props: ICommitSummaryProps) {
    super(props)

    this.state = createState(false, props)

    const ResizeObserverClass: typeof ResizeObserver = (window as any)
      .ResizeObserver

    if (ResizeObserverClass || false) {
      this.resizeObserver = new ResizeObserverClass(entries => {
        for (const entry of entries) {
          if (entry.target === this.descriptionScrollViewRef) {
            // We might end up causing a recursive update by updating the state
            // when we're reacting to a resize so we'll defer it until after
            // react is done with this frame.
            if (this.updateOverflowTimeoutId !== null) {
              clearImmediate(this.updateOverflowTimeoutId)
            }

            this.updateOverflowTimeoutId = setImmediate(this.onResized)
          }
        }
      })
    }
  }

  private onResized = () => {
    if (this.descriptionRef) {
      const descriptionBottom =
        this.descriptionRef.getBoundingClientRect().bottom
      this.props.onDescriptionBottomChanged(descriptionBottom)
    }

    if (this.props.isExpanded) {
      return
    }

    this.updateOverflow()
  }

  private onDescriptionScrollViewRef = (ref: HTMLDivElement | null) => {
    this.descriptionScrollViewRef = ref

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()

      if (ref) {
        this.resizeObserver.observe(ref)
      } else {
        this.setState({ isOverflowed: false })
      }
    }
  }

  private onDescriptionRef = (ref: HTMLDivElement | null) => {
    this.descriptionRef = ref
  }

  private renderExpander() {
    if (
      !this.state.body.length ||
      (!this.props.isExpanded && !this.state.isOverflowed)
    ) {
      return null
    }

    const expanded = this.props.isExpanded
    const onClick = expanded ? this.onCollapse : this.onExpand
    const icon = expanded ? octicons.fold : octicons.unfold

    return (
      <button onClick={onClick} className="expander">
        <Octicon symbol={icon} />
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    )
  }

  private onExpand = () => {
    this.props.onExpandChanged(true)
  }

  private onCollapse = () => {
    if (this.descriptionScrollViewRef) {
      this.descriptionScrollViewRef.scrollTop = 0
    }

    this.props.onExpandChanged(false)
  }

  private updateOverflow() {
    const scrollView = this.descriptionScrollViewRef
    if (scrollView) {
      this.setState({
        isOverflowed: scrollView.scrollHeight > scrollView.offsetHeight,
      })
    } else {
      if (this.state.isOverflowed) {
        this.setState({ isOverflowed: false })
      }
    }
  }

  public componentDidMount() {
    // No need to check if it overflows if we're expanded
    if (!this.props.isExpanded) {
      this.updateOverflow()
    }
  }

  public componentWillUpdate(nextProps: ICommitSummaryProps) {
    if (
      nextProps.selectedCommits.length !== this.props.selectedCommits.length ||
      !nextProps.selectedCommits.every((nextCommit, i) =>
        messageEquals(nextCommit, this.props.selectedCommits[i])
      )
    ) {
      this.setState(createState(false, nextProps))
    }
  }

  public componentDidUpdate(
    prevProps: ICommitSummaryProps,
    prevState: ICommitSummaryState
  ) {
    // No need to check if it overflows if we're expanded
    if (!this.props.isExpanded) {
      // If the body has changed or we've just toggled the expanded
      // state we'll recalculate whether we overflow or not.
      if (prevState.body !== this.state.body || prevProps.isExpanded) {
        this.updateOverflow()
      }
    } else {
      // Clear overflow state if we're expanded, we don't need it.
      if (this.state.isOverflowed) {
        this.setState({ isOverflowed: false })
      }
    }
  }

  private renderDescription() {
    if (this.state.body.length === 0) {
      return null
    }

    return (
      <div
        className="commit-summary-description-container"
        ref={this.onDescriptionRef}
      >
        <div
          className="commit-summary-description-scroll-view"
          ref={this.onDescriptionScrollViewRef}
        >
          <RichText
            className="commit-summary-description"
            emoji={this.props.emoji}
            repository={this.props.repository}
            text={this.state.body}
          />
        </div>

        {this.renderExpander()}
      </div>
    )
  }

  private onHighlightShasInDiff = () => {
    this.props.onHighlightShas(this.props.shasInDiff)
  }

  private onHighlightShasNotInDiff = () => {
    const { onHighlightShas, selectedCommits, shasInDiff } = this.props
    onHighlightShas(
      selectedCommits.filter(c => !shasInDiff.includes(c.sha)).map(c => c.sha)
    )
  }

  private onRemoveHighlightOfShas = () => {
    this.props.onHighlightShas([])
  }

  private showUnreachableCommits = () => {
    this.props.showUnreachableCommits(UnreachableCommitsTab.Unreachable)
  }

  private showReachableCommits = () => {
    this.props.showUnreachableCommits(UnreachableCommitsTab.Reachable)
  }

  private renderCommitsNotReachable = () => {
    const { selectedCommits, shasInDiff } = this.props
    if (selectedCommits.length === 1) {
      return
    }

    const excludedCommitsCount = this.getCountCommitsNotInDiff(
      selectedCommits,
      shasInDiff
    )

    if (excludedCommitsCount === 0) {
      return
    }

    const commitsPluralized = excludedCommitsCount > 1 ? 'commits' : 'commit'

    return (
      // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
      <div
        className="commit-unreachable-info"
        onMouseOver={this.onHighlightShasNotInDiff}
        onMouseOut={this.onRemoveHighlightOfShas}
      >
        <Octicon symbol={octicons.info} />
        <LinkButton onClick={this.showUnreachableCommits}>
          {excludedCommitsCount} unreachable {commitsPluralized}
        </LinkButton>{' '}
        not included.
      </div>
    )
  }

  private renderAuthors = () => {
    const { selectedCommits, repository, accounts } = this.props
    const { avatarUsers } = this.state
    if (selectedCommits.length > 1) {
      return
    }

    return (
      <li className="commit-summary-meta-item without-truncation">
        <AvatarStack users={avatarUsers} accounts={accounts} />
        <CommitAttribution
          gitHubRepository={repository.gitHubRepository}
          commits={selectedCommits}
        />
      </li>
    )
  }

  private renderCommitRef = () => {
    const { selectedCommits } = this.props
    if (selectedCommits.length > 1) {
      return
    }

    return (
      <li
        className="commit-summary-meta-item without-truncation"
        aria-label="SHA"
      >
        <Octicon symbol={octicons.gitCommit} />
        <TooltippedCommitSHA
          className="selectable"
          commit={selectedCommits[0]}
        />
      </li>
    )
  }

  private renderSummary = () => {
    const { selectedCommits, shasInDiff } = this.props
    const { summary, hasEmptySummary } = this.state
    const summaryClassNames = classNames('commit-summary-title', {
      'empty-summary': hasEmptySummary,
    })

    if (selectedCommits.length === 1) {
      return (
        <RichText
          className={summaryClassNames}
          emoji={this.props.emoji}
          repository={this.props.repository}
          text={summary}
        />
      )
    }

    const commitsNotInDiff = this.getCountCommitsNotInDiff(
      selectedCommits,
      shasInDiff
    )
    const numInDiff = selectedCommits.length - commitsNotInDiff
    const commitsPluralized = numInDiff > 1 ? 'commits' : 'commit'
    return (
      <div className={summaryClassNames}>
        Showing changes from{' '}
        {commitsNotInDiff > 0 ? (
          <LinkButton
            onMouseOver={this.onHighlightShasInDiff}
            onMouseOut={this.onRemoveHighlightOfShas}
            onClick={this.showReachableCommits}
          >
            {numInDiff} {commitsPluralized}
          </LinkButton>
        ) : (
          <>
            {' '}
            {numInDiff} {commitsPluralized}
          </>
        )}
      </div>
    )
  }

  public render() {
    const className = classNames({
      expanded: this.props.isExpanded,
      collapsed: !this.props.isExpanded,
      'has-expander': this.props.isExpanded || this.state.isOverflowed,
      'hide-description-border': this.props.hideDescriptionBorder,
    })

    return (
      <div id="commit-summary" className={className}>
        <div className="commit-summary-header">
          {this.renderSummary()}
          <ul className="commit-summary-meta">
            {this.renderAuthors()}
            {this.renderCommitRef()}
            {this.renderChangedFilesDescription()}
            {this.renderLinesChanged()}
            {this.renderTags()}

            <li className="commit-summary-meta-item without-truncation">
              <DiffOptions
                isInteractiveDiff={false}
                hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
                onHideWhitespaceChangesChanged={
                  this.props.onHideWhitespaceInDiffChanged
                }
                showSideBySideDiff={this.props.showSideBySideDiff}
                onShowSideBySideDiffChanged={
                  this.props.onShowSideBySideDiffChanged
                }
                onDiffOptionsOpened={this.props.onDiffOptionsOpened}
              />
            </li>
          </ul>
        </div>

        {this.renderDescription()}
        {this.renderCommitsNotReachable()}
      </div>
    )
  }

  private renderChangedFilesDescription = () => {
    const fileCount = this.props.changesetData.files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesShortDescription = `${fileCount} changed ${filesPlural}`

    let filesAdded = 0
    let filesModified = 0
    let filesRemoved = 0
    let filesRenamed = 0
    for (const file of this.props.changesetData.files) {
      switch (file.status.kind) {
        case AppFileStatusKind.New:
          filesAdded += 1
          break
        case AppFileStatusKind.Modified:
          filesModified += 1
          break
        case AppFileStatusKind.Deleted:
          filesRemoved += 1
          break
        case AppFileStatusKind.Renamed:
          filesRenamed += 1
      }
    }

    const hasFileDescription =
      filesAdded + filesModified + filesRemoved + filesRenamed > 0

    const filesLongDescription = (
      <>
        {filesAdded > 0 ? (
          <span>
            <Octicon className="files-added-icon" symbol={octicons.diffAdded} />
            {filesAdded} added
          </span>
        ) : null}
        {filesModified > 0 ? (
          <span>
            <Octicon
              className="files-modified-icon"
              symbol={octicons.diffModified}
            />
            {filesModified} modified
          </span>
        ) : null}
        {filesRemoved > 0 ? (
          <span>
            <Octicon
              className="files-deleted-icon"
              symbol={octicons.diffRemoved}
            />
            {filesRemoved} deleted
          </span>
        ) : null}
        {filesRenamed > 0 ? (
          <span>
            <Octicon
              className="files-renamed-icon"
              symbol={octicons.diffRenamed}
            />
            {filesRenamed} renamed
          </span>
        ) : null}
      </>
    )

    return (
      <TooltippedContent
        className="commit-summary-meta-item without-truncation"
        tooltipClassName="changed-files-description-tooltip"
        tooltip={
          fileCount > 0 && hasFileDescription ? filesLongDescription : undefined
        }
      >
        <Octicon symbol={octicons.diff} />
        {filesShortDescription}
      </TooltippedContent>
    )
  }

  private renderLinesChanged() {
    const linesAdded = this.props.changesetData.linesAdded
    const linesDeleted = this.props.changesetData.linesDeleted
    if (linesAdded + linesDeleted === 0) {
      return null
    }

    const linesAddedPlural = linesAdded === 1 ? 'line' : 'lines'
    const linesDeletedPlural = linesDeleted === 1 ? 'line' : 'lines'
    const linesAddedTitle = `${linesAdded} ${linesAddedPlural} added`
    const linesDeletedTitle = `${linesDeleted} ${linesDeletedPlural} deleted`

    return (
      <>
        <TooltippedContent
          tagName="li"
          className="commit-summary-meta-item without-truncation lines-added"
          tooltip={linesAddedTitle}
        >
          +{linesAdded}
        </TooltippedContent>
        <TooltippedContent
          tagName="li"
          className="commit-summary-meta-item without-truncation lines-deleted"
          tooltip={linesDeletedTitle}
        >
          -{linesDeleted}
        </TooltippedContent>
      </>
    )
  }

  private renderTags() {
    const { selectedCommits } = this.props
    if (selectedCommits.length > 1) {
      return
    }

    const tags = selectedCommits[0].tags

    if (tags.length === 0) {
      return
    }

    return (
      <li className="commit-summary-meta-item" title={tags.join('\n')}>
        <span>
          <Octicon symbol={octicons.tag} />
        </span>

        <span className="tags selectable">{tags.join(', ')}</span>
      </li>
    )
  }
}
