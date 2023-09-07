import * as React from 'react'
import classNames from 'classnames'

import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { RichText } from '../lib/rich-text'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { getAvatarUsersForCommit, IAvatarUser } from '../../models/avatar'
import { AvatarStack } from '../lib/avatar-stack'
import { CommitAttribution } from '../lib/commit-attribution'
import { Tokenizer, TokenResult } from '../../lib/text-token-parser'
import { wrapRichTextCommitMessage } from '../../lib/wrap-rich-text-commit-message'
import { IChangesetData } from '../../lib/git'
import { TooltippedContent } from '../lib/tooltipped-content'
import { AppFileStatusKind } from '../../models/status'
import _ from 'lodash'
import { LinkButton } from '../lib/link-button'
import { UnreachableCommitsTab } from './unreachable-commits-dialog'
import { TooltippedCommitSHA } from '../lib/tooltipped-commit-sha'
import memoizeOne from 'memoize-one'
import { Avatar } from '../lib/avatar'

interface ICommitSummaryProps {
  readonly repository: Repository
  readonly selectedCommits: ReadonlyArray<Commit>
  readonly shasInDiff: ReadonlyArray<string>
  readonly changesetData: IChangesetData
  readonly emoji: Map<string, string>

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
function createState(props: ICommitSummaryProps): ICommitSummaryState {
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

  const avatarUsers = _.uniqWith(
    allAvatarUsers,
    (a, b) => a.email === b.email && a.name === b.name
  )

  return { summary, body, avatarUsers, hasEmptySummary }
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

    this.state = createState(props)
  }

  public componentWillUpdate(nextProps: ICommitSummaryProps) {
    if (
      nextProps.selectedCommits.length !== this.props.selectedCommits.length ||
      !nextProps.selectedCommits.every((nextCommit, i) =>
        messageEquals(nextCommit, this.props.selectedCommits[i])
      )
    ) {
      this.setState(createState(nextProps))
    }
  }

  private onExpandChanged = () => {
    this.props.onExpandChanged(!this.props.isExpanded)
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

  private renderSummary = () => {
    const { selectedCommits, shasInDiff } = this.props
    const { summary, hasEmptySummary } = this.state
    const summaryClassNames = classNames('commit-summary-title', {
      'empty-summary': hasEmptySummary,
    })

    let summaryContent

    if (selectedCommits.length === 1) {
      summaryContent = (
        <RichText
          emoji={this.props.emoji}
          repository={this.props.repository}
          text={summary}
        />
      )
    } else {
      const commitsNotInDiff = this.getCountCommitsNotInDiff(
        selectedCommits,
        shasInDiff
      )
      const numInDiff = selectedCommits.length - commitsNotInDiff
      const commitsPluralized = numInDiff > 1 ? 'commits' : 'commit'

      summaryContent = (
        <>
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
        </>
      )
    }

    return (
      <div className={summaryClassNames}>
        {summaryContent}
        {this.renderExpander()}
      </div>
    )
  }

  private renderExpander() {
    const { isExpanded } = this.props
    const icon = isExpanded ? OcticonSymbol.fold : OcticonSymbol.unfold

    return (
      <button onClick={this.onExpandChanged} className="expander">
        <Octicon symbol={icon} />
        {isExpanded ? 'Collapse' : 'Expand'}
      </button>
    )
  }

  private renderDescription() {
    if (this.state.body.length === 0) {
      return null
    }

    return (
      <RichText
        className="commit-body"
        emoji={this.props.emoji}
        repository={this.props.repository}
        text={this.state.body}
      />
    )
  }

  private renderCommitMetaData = () => {
    return (
      <div className="commit-summary-meta">
        {this.renderAuthors()}
        {this.renderCommitRef()}
        {this.renderChangedFilesDescription()}
        {this.renderLinesChanged()}
        {this.renderTags()}
      </div>
    )
  }

  private renderExpandedAuthor(
    user: IAvatarUser
  ): string | JSX.Element | undefined {
    if (user) {
      if (user.name) {
        return (
          <>
            {user.name}
            {' <'}
            {user.email}
            {'>'}
          </>
        )
      } else {
        return user.email
      }
    }

    return 'Unknown user'
  }

  private renderAuthorStack = () => {
    const { selectedCommits, repository } = this.props
    const { avatarUsers } = this.state

    return (
      <>
        <AvatarStack users={avatarUsers} />
        <CommitAttribution
          gitHubRepository={repository.gitHubRepository}
          commits={selectedCommits}
        />
      </>
    )
  }

  private renderAuthorList = () => {
    const { avatarUsers } = this.state
    const elems = []

    for (let i = 0; i < avatarUsers.length; i++) {
      elems.push(
        <div className="author">
          <Avatar key={`${i}`} user={avatarUsers[i]} title={null} />
          <div>{this.renderExpandedAuthor(avatarUsers[i])}</div>
        </div>
      )
    }

    return elems
  }

  private renderAuthors = () => {
    const { selectedCommits } = this.props

    if (selectedCommits.length > 1) {
      return
    }

    return (
      <div className="commit-summary-meta-item authors">
        {this.props.isExpanded
          ? this.renderAuthorList()
          : this.renderAuthorStack()}
      </div>
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
        <Octicon symbol={OcticonSymbol.gitCommit} />
        <TooltippedCommitSHA
          className="selectable"
          commit={selectedCommits[0]}
        />
      </li>
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
            <Octicon
              className="files-added-icon"
              symbol={OcticonSymbol.diffAdded}
            />
            {filesAdded} added
          </span>
        ) : null}
        {filesModified > 0 ? (
          <span>
            <Octicon
              className="files-modified-icon"
              symbol={OcticonSymbol.diffModified}
            />
            {filesModified} modified
          </span>
        ) : null}
        {filesRemoved > 0 ? (
          <span>
            <Octicon
              className="files-deleted-icon"
              symbol={OcticonSymbol.diffRemoved}
            />
            {filesRemoved} deleted
          </span>
        ) : null}
        {filesRenamed > 0 ? (
          <span>
            <Octicon
              className="files-renamed-icon"
              symbol={OcticonSymbol.diffRenamed}
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
        <Octicon symbol={OcticonSymbol.diff} />
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
        <span aria-label="Tags">
          <Octicon symbol={OcticonSymbol.tag} />
        </span>

        <span className="tags">{tags.join(', ')}</span>
      </li>
    )
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
        <Octicon symbol={OcticonSymbol.info} />
        <LinkButton onClick={this.showUnreachableCommits}>
          {excludedCommitsCount} unreachable {commitsPluralized}
        </LinkButton>{' '}
        not included.
      </div>
    )
  }

  public render() {
    const className = classNames({
      expanded: this.props.isExpanded,
    })

    return (
      <div id="commit-summary" className={className}>
        <div className="commit-summary-header">
          {this.renderSummary()}
          {this.renderDescription()}
          {this.renderCommitMetaData()}
        </div>

        {this.renderCommitsNotReachable()}
      </div>
    )
  }
}
