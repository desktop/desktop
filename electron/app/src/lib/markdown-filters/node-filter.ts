import memoizeOne from 'memoize-one'
import { EmojiFilter } from './emoji-filter'
import { IssueLinkFilter } from './issue-link-filter'
import { IssueMentionFilter } from './issue-mention-filter'
import { MentionFilter } from './mention-filter'
import { VideoLinkFilter } from './video-link-filter'
import { VideoTagFilter } from './video-tag-filter'
import { TeamMentionFilter } from './team-mention-filter'
import { CommitMentionFilter } from './commit-mention-filter'
import {
  CloseKeywordFilter,
  isIssueClosingContext,
} from './close-keyword-filter'
import { CommitMentionLinkFilter } from './commit-mention-link-filter'
import { GitHubRepository } from '../../models/github-repository'
import { Emoji } from '../emoji'

export interface INodeFilter {
  /**
   * Creates a document tree walker filtered to the nodes relevant to the node filter.
   *
   * Examples:
   * 1) An Emoji filter operates on all text nodes, but not inside pre or code tags.
   * 2) The issue mention filter operates on all text nodes, but not inside pre, code, or anchor tags
   */
  createFilterTreeWalker(doc: Document): TreeWalker

  /**
   * This filter accepts a document node and searches for it's pattern within it.
   *
   * If found, returns an array of nodes to replace the node with.
   *    Example: [Node(contents before match), Node(match replacement), Node(contents after match)]
   * If not found, returns null
   *
   * This is asynchronous as some filters have data must be fetched or, like in
   * emoji, the conversion to base 64 data uri is asynchronous
   * */
  filter(node: Node): Promise<ReadonlyArray<Node> | null>
}

export interface ICustomMarkdownFilterOptions {
  emoji: Map<string, Emoji>
  repository?: GitHubRepository
  markdownContext?: MarkdownContext
}

/**
 * Builds an array of node filters to apply to markdown html. Referring to it as pipe
 * because they will be applied in the order they are entered in the returned
 * array. This is important as some filters impact others.
 */
export const buildCustomMarkDownNodeFilterPipe = memoizeOne(
  (options: ICustomMarkdownFilterOptions): ReadonlyArray<INodeFilter> => {
    const { emoji, repository, markdownContext } = options
    const filterPipe: Array<INodeFilter> = []

    if (repository !== undefined) {
      /* The CloseKeywordFilter must be applied before the IssueMentionFilter or
       * IssueLinkFilter so we can scan for plain text or pasted link issue
       * mentions in conjunction wth the keyword.
       */
      if (
        markdownContext !== undefined &&
        isIssueClosingContext(markdownContext)
      ) {
        filterPipe.push(new CloseKeywordFilter(markdownContext, repository))
      }

      filterPipe.push(
        new IssueMentionFilter(repository),
        new IssueLinkFilter(repository)
      )
    }

    filterPipe.push(new EmojiFilter(emoji))

    if (repository !== undefined) {
      filterPipe.push(
        // Note: TeamMentionFilter was placed before MentionFilter as they search
        // for similar patterns with TeamMentionFilter having a larger application.
        // @org/something vs @username. Thus, even tho the MentionFilter regex is
        // meant to prevent this, in case a username could be encapsulated in the
        // team mention like @username/something, we do the team mentions first to
        // eliminate the possibility.
        new TeamMentionFilter(repository),
        new MentionFilter(repository),
        new CommitMentionFilter(repository),
        new CommitMentionLinkFilter(repository)
      )
    }

    filterPipe.push(new VideoTagFilter(), new VideoLinkFilter())

    return filterPipe
  }
)

/** The context of which markdown resides */
export type MarkdownContext =
  | 'PullRequest'
  | 'PullRequestComment'
  | 'IssueComment'
  | 'Commit'
