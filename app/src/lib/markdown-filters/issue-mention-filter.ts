import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../../ui/dispatcher'
import { fatalError } from '../fatal-error'
import { INodeFilter } from './node-filter'

/**
 * The Issue Mention filter matches for issue references in user-supplied
 * content one of two formats:
 *
 *  1. As a plain text reference, like #1234, gh-1234, /issues/1234, /pull/1234, or /discussions/1234
 *      Note: gh- is a legacy marker before #.
 *
 *  2. TO DO - anchor tags with links
 *
 */
export class IssueMentionFilter implements INodeFilter {
  /** A regular expression string to match a group of any digit follow by a word
   * bounding character. */
  private readonly number = `?(?<refNumber>\\d+)\\b`

  /** A regular expression string to match a group of an repo name or name with
   * owner -> github/github or github  */
  private readonly nameOrNWO = `(?<nameOrNWO>w+(?:-w+)*(?:\/[.w-]+)?)`

  /** A regular expression string to match a group possible preceding markers are
   * gh-, #, /issues/, /pull/, or /discussions/ followed by a digit
   */
  private readonly marker = `(?<marker>#|gh-|\/(?:issues|pull|discussions)\/)(?=\\d)`

  /**
   * A regular expression string of a lookbehind is used so that valid
   * matches for the issue reference have the leader precede them but the leader
   * is not considered part of the match. An issue reference much have a
   * whitespace, beginning of line, or some other non-word character must
   * preceding it.
   * */
  private readonly leader = `(?<=^|\\W)`

  /**
   * A regular expression matching an issue reference.
   * Issue reference must:
   * 1) Be preceded by a beginning of a line or some some other non-word
   *    character.
   * 2) Start with an issue marker: gh-, #, /issues/, /pull/, or /discussions/
   * 3) The issue marker must be followed by a number
   * 4) The number must end in a word bounding character. Additionally, the
   *    issue reference match may be such that the marker may be preceded by a
   *    repo references of owner/repo or repo/
   * */
  private readonly issueReferenceWithLeader = new RegExp(
    this.leader + this.nameOrNWO + '?' + this.marker + this.number,
    'ig'
  )

  private readonly dispatcher: Dispatcher
  private readonly repository: GitHubRepository

  public constructor(dispatcher: Dispatcher, repository: GitHubRepository) {
    this.dispatcher = dispatcher
    this.repository = repository
  }

  /**
   * Issue mention filter iterates on all text nodes that are not inside a pre, code, or anchor tag.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return node.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(node.parentNode.nodeName)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  /**
   * Takes a text node and creates multiple text and image nodes by inserting
   * anchor tags where the references are.
   *
   * Example:
   * Node = "Issue #1234 is the same thing"
   * Output = ["Issue ", <a href="https://github.com/owner/repo/issues/1234">#1234</a>, " is the same thing"]
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    if (!(node instanceof Text)) {
      fatalError(
        'Issue filter requires text nodes; otherwise we may inadvertently replace non text elements.'
      )
    }

    const { textContent: text } = node
    const markerRegexp = new RegExp(this.marker, 'i')
    if (text === null || !markerRegexp.test(text)) {
      return null
    }

    let lastMatchEndingPosition = 0
    const nodes: Array<Text | HTMLAnchorElement> = []
    const matches = text.matchAll(this.issueReferenceWithLeader)
    for (const match of matches) {
      if (match.groups === undefined || match.index === undefined) {
        continue
      }

      const { marker, refNumber, nameOrNWO } = match.groups
      if (marker === undefined || refNumber === undefined) {
        continue
      }

      const textBefore = text.slice(lastMatchEndingPosition, match.index)
      const textNodeBefore = document.createTextNode(textBefore)
      nodes.push(textNodeBefore)

      nodes.push(
        await this.createIssueAnchorElement(marker, refNumber, nameOrNWO)
      )

      lastMatchEndingPosition = match.index + marker.length + refNumber.length
    }

    const trailingText = text.slice(lastMatchEndingPosition)
    if (trailingText !== '') {
      nodes.push(document.createTextNode(trailingText))
    }

    return nodes
  }

  /**
   * Method to create the issue mention anchor or returns a text node with the ref if unable.
   */
  private async createIssueAnchorElement(
    marker: string,
    refNumber: string,
    nwo?: string
  ) {
    // TODO: build a cache... so we don't retrieve same issue many times
    const issueOrDiscussionURL = await this.dispatcher.fetchIssueOrDiscussionURL(
      this.repository,
      refNumber
    )
    const anchorText = `${marker}${refNumber}`

    if (issueOrDiscussionURL === null) {
      return document.createTextNode(anchorText)
    }

    const anchor = document.createElement('a')
    anchor.textContent = anchorText
    anchor.href = issueOrDiscussionURL
    return anchor
  }
}
