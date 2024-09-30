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
import { IChangesetData } from '../../lib/git'
import uniqWith from 'lodash/uniqWith'
import { LinkButton } from '../lib/link-button'
import { UnreachableCommitsTab } from './unreachable-commits-dialog'
import memoizeOne from 'memoize-one'
import { Button } from '../lib/button'
import { Avatar } from '../lib/avatar'
import { CopyButton } from '../copy-button'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

interface IExpandableCommitSummaryProps {
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

  /** Called to highlight certain shas in the history */
  readonly onHighlightShas: (shasToHighlight: ReadonlyArray<string>) => void

  /** Called to show unreachable commits dialog */
  readonly showUnreachableCommits: (tab: UnreachableCommitsTab) => void

  readonly accounts: ReadonlyArray<Account>
}

interface IExpandableCommitSummaryState {
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
 * Creates the state object for the ExpandableCommitSummary component.
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
  props: IExpandableCommitSummaryProps
): IExpandableCommitSummaryState {
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

export class ExpandableCommitSummary extends React.Component<
  IExpandableCommitSummaryProps,
  IExpandableCommitSummaryState
> {
  private descriptionScrollViewRef: HTMLDivElement | null = null
  private readonly resizeObserver: ResizeObserver | null = null
  private updateOverflowTimeoutId: NodeJS.Immediate | null = null

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

  public constructor(props: IExpandableCommitSummaryProps) {
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

  private renderExpander() {
    const { selectedCommits, isExpanded } = this.props
    if (selectedCommits.length > 1) {
      return null
    }

    return (
      <Button
        onClick={isExpanded ? this.onCollapse : this.onExpand}
        className="expander"
        tooltip={isExpanded ? 'Collapse' : 'Expand'}
        applyTooltipAriaDescribedBy={false}
        ariaExpanded={isExpanded}
        ariaLabel={
          isExpanded ? 'Collapse commit details' : 'Expand commit details'
        }
        ariaControls="expandable-commit-summary"
      >
        <Octicon symbol={isExpanded ? octicons.fold : octicons.unfold} />
      </Button>
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

  public componentWillUpdate(nextProps: IExpandableCommitSummaryProps) {
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
    prevProps: IExpandableCommitSummaryProps,
    prevState: IExpandableCommitSummaryState
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
    if (this.state.body.length === 0 || this.props.selectedCommits.length > 1) {
      return null
    }

    const className = classNames('ecs-description', {
      overflowed: this.state.isOverflowed,
    })

    return (
      <div className={className}>
        <div
          className="ecs-description-scroll-view"
          ref={this.onDescriptionScrollViewRef}
        >
          <RichText
            className="ecs-description-text selectable"
            emoji={this.props.emoji}
            repository={this.props.repository}
            text={this.state.body}
          />
        </div>
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

  private renderExpandedAuthor(user: IAvatarUser): string | JSX.Element {
    if (!user) {
      return 'Unknown user'
    }

    if (user.name) {
      return (
        <>
          {user.name}
          {' <'}
          {user.email}
          {'>'}
        </>
      )
    }

    return user.email
  }

  private renderAuthorList = () => {
    return this.state.avatarUsers.map((user, i) => {
      return (
        <div className="author selectable" key={i}>
          <Avatar accounts={this.props.accounts} user={user} title={null} />
          <div>{this.renderExpandedAuthor(user)}</div>
        </div>
      )
    })
  }

  private renderAuthorStack = () => {
    const { selectedCommits, repository, accounts } = this.props
    const { avatarUsers } = this.state

    return (
      <>
        <AvatarStack users={avatarUsers} accounts={accounts} />
        <CommitAttribution
          gitHubRepository={repository.gitHubRepository}
          commits={selectedCommits}
        />
      </>
    )
  }

  private renderAuthors = () => {
    const { selectedCommits, isExpanded } = this.props
    if (selectedCommits.length > 1) {
      return
    }

    return (
      <div className="ecs-meta-item authors">
        {isExpanded ? this.renderAuthorList() : this.renderAuthorStack()}
      </div>
    )
  }

  private renderCommitRef = () => {
    const { selectedCommits, isExpanded } = this.props
    if (selectedCommits.length > 1) {
      return
    }

    const { shortSha, sha } = selectedCommits[0]

    return (
      <div className="ecs-meta-item commit-ref">
        <Octicon symbol={octicons.gitCommit} />
        <div className="ref selectable">{isExpanded ? sha : shortSha}</div>
        <CopyButton ariaLabel="Copy the full SHA" copyContent={sha} />
      </div>
    )
  }

  private renderSummaryText = () => {
    const { selectedCommits, shasInDiff } = this.props
    const { summary } = this.state

    if (selectedCommits.length === 1) {
      return (
        <RichText
          emoji={this.props.emoji}
          repository={this.props.repository}
          className="selectable"
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
      <>
        Showing changes from{' '}
        {commitsNotInDiff > 0 ? (
          <LinkButton
            className="commits-in-diff"
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
      </>
    )
  }

  private renderSummary = () => {
    const { hasEmptySummary } = this.state
    const summaryClassNames = classNames('ecs-title', {
      'empty-summary': hasEmptySummary,
    })

    return (
      <div className={summaryClassNames}>
        {this.renderSummaryText()}
        {this.renderExpander()}
      </div>
    )
  }

  private renderMetaItems = () => {
    if (this.props.selectedCommits.length > 1) {
      return null
    }

    return (
      <div className="ecs-meta">
        {this.renderAuthors()}
        {this.renderCommitRef()}
        {this.renderLinesChanged()}
        {this.renderTags()}
      </div>
    )
  }

  public render() {
    const className = classNames({
      expanded: this.props.isExpanded,
    })

    return (
      <div id="expandable-commit-summary" className={className}>
        {this.renderSummary()}
        <div className="beneath-summary">
          {this.renderDescription()}
          {this.renderMetaItems()}
        </div>
        {this.renderCommitsNotReachable()}
      </div>
    )
  }

  private renderLinesChanged() {
    const { changesetData, selectedCommits, isExpanded } = this.props
    const { linesAdded, linesDeleted } = changesetData

    if (
      (linesAdded === 0 && linesDeleted === 0) ||
      selectedCommits.length > 1
    ) {
      return null
    }

    return (
      <div className="ecs-meta-item lines-added-deleted">
        {isExpanded ? <Octicon symbol={octicons.diff} /> : null}
        <div className="lines-added">
          {!isExpanded ? <>+{linesAdded}</> : <>{linesAdded} added lines</>}
        </div>
        <div className="lines-deleted">
          {!isExpanded ? (
            <>-{linesDeleted}</>
          ) : (
            <>{linesDeleted} removed lines</>
          )}
        </div>
      </div>
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
      <div className="ecs-meta-item tags selectable">
        <Octicon symbol={octicons.tag} />
        <span>{tags.join(', ')}</span>
      </div>
    )
  }
}
