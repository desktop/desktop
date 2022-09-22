import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../api'
import { INodeFilter } from './node-filter'
import { resolveOwnerRepo } from './resolve-owner-repo'

/** A regular expression to match a group of any digit follow by a word
 * bounding character.
 * Example: 123 or 123.
 */
const IssueRefNumber = /(?<refNumber>\d+)\b/

/** A regular expression to match a group of an repo name or name with owner
 * Example: desktop/dugite or desktop
 */
const IssueOwnerOrOwnerRepo = /(?<ownerOrOwnerRepo>\w+(?:-\w+)*(?:\/[.\w-]+)?)/

/** A regular expression to match a group possible of preceding markers are
 * gh-, #, /issues/, /pull/, or /discussions/ followed by a digit
 */
const IssueMentionMarker =
  /(?<marker>#|gh-|\/(?:issues|pull|discussions)\/)(?=\d)/i

/**
 * A regular expression string of a lookbehind is used so that valid matches
 * for the issue reference have the leader precede them but the leader is not
 * considered part of the match. An issue reference much have a whitespace,
 * beginning of line, or some other non-word character must precede it.
 * */
const IssueMentionLeader = /(?<=^|\W)/

/**
 * A regular expression matching an issue reference. Issue reference must:
 * 1) Start with an issue marker: gh-, #, /issues/, /pull/, or /discussions/
 * 2) The issue marker must be followed by a number
 * 3) The number must end in a word bounding character. Additionally, the
 *    issue reference match may be such that the marker may be preceded by a
 *    repo references of owner/repo or owner
 * */
export const IssueReference = new RegExp(
  IssueOwnerOrOwnerRepo.source +
    '?' +
    IssueMentionMarker.source +
    IssueRefNumber.source,
  'i'
)

/**
 * The Issue Mention filter matches for text issue references. For this purpose,
 * issues, pull requests, and discussions all share reference patterns and
 * therefore are all filtered.
 *
 * Examples:  #1234, gh-1234, /issues/1234, /pull/1234, or /discussions/1234,
 * desktop/dugite#1, desktop/dugite/issues/1234
 *
 * Each references is made up of {ownerOrOwnerRepo}{marker}{number} and must be
 * preceded by a non-word character.
 *   - ownerOrOwnerRepo: Optional. If both owner/repo is provided, it can be
 *              used to specify an issue outside of the parent repository.
 *              Redundant references will be trimmed. Single owners can be
 *              redundant, but single repo names are treated as non-matches.
 *
 *              Example: When viewing from the tidy-dev/foo repo,
 *                  a. tidy-dev/foo#1 becomes linked as #1.
 *                  b. tidy-dev#1 becomes linked as #1,
 *                  c. foo#1 is not linked and is a non-match.
 *                  d. desktop/desktop#1 is linked and stays desktop/desktop#1
 *
 *   - marker: Required #, gh-, /issues/, /pull/, or /discussions/
 *   - number: Required and must be digits followed by a word bounding
 *             character like a whitespace or period.
 *
 */
export class IssueMentionFilter implements INodeFilter {
  /**
   * A regular expression matching an issue reference.
   * Issue reference must:
   * 1) Be preceded by a beginning of a line or some some other non-word
   *    character.
   * 2) Start with an issue marker: gh-, #, /issues/, /pull/, or /discussions/
   * 3) The issue marker must be followed by a number
   * 4) The number must end in a word bounding character. Additionally, the
   *    issue reference match may be such that the marker may be preceded by a
   *    repo references of owner/repo or owner
   * */
  private readonly issueReferenceWithLeader = new RegExp(
    IssueMentionLeader.source + IssueReference.source,
    'ig'
  )

  /** The parent github repository of which the content the filter is being
   * applied to belongs  */
  private readonly repository: GitHubRepository

  public constructor(repository: GitHubRepository) {
    this.repository = repository
  }

  /**
   * Returns tree walker that iterates on all text nodes that are not inside a
   * pre, code, or anchor tag.
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
   * Takes a text node and creates multiple text and anchor nodes by inserting
   * anchor tags where the matched issue mentions exist.
   *
   * Warning: This filter can create false positives. It assumes the issues
   * exists that are mentioned. Thus, if a user references a non-existent
   * #99999999 issue, it will still create a link for it. This is a deviation
   * from dotcoms approach that verifies each link, but we do not want to incur
   * the performance penalty of making that call.
   *
   * Example:
   * Node = "Issue #1234 is the same thing"
   * Output = ["Issue ", <a href="https://github.com/owner/repo/issues/1234">#1234</a>, " is the same thing"]
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    const { textContent: text } = node
    if (
      node.nodeType !== node.TEXT_NODE ||
      text === null ||
      !IssueMentionMarker.test(text)
    ) {
      return null
    }

    let lastMatchEndingPosition = 0
    const nodes: Array<Text | HTMLAnchorElement> = []
    const matches = text.matchAll(this.issueReferenceWithLeader)
    for (const match of matches) {
      if (match.groups === undefined || match.index === undefined) {
        continue
      }

      const { marker, refNumber, ownerOrOwnerRepo } = match.groups
      if (marker === undefined || refNumber === undefined) {
        continue
      }

      const link = this.createLinkElement(marker, refNumber, ownerOrOwnerRepo)
      if (link === null) {
        continue
      }

      const textBefore = text.slice(lastMatchEndingPosition, match.index)
      const textNodeBefore = document.createTextNode(textBefore)
      nodes.push(textNodeBefore)
      nodes.push(link)

      lastMatchEndingPosition =
        match.index +
        (ownerOrOwnerRepo?.length ?? 0) +
        marker.length +
        refNumber.length
    }

    const trailingText = text.slice(lastMatchEndingPosition)
    if (trailingText !== '') {
      nodes.push(document.createTextNode(trailingText))
    }

    return nodes
  }

  /**
   * Method to create the issue mention anchor. If unable to parse ownerRepo,
   * then returns a null as this would indicate an invalid reference.
   */
  private createLinkElement(
    marker: string,
    refNumber: string,
    ownerOrOwnerRepo?: string
  ) {
    let text = `${marker}${refNumber}`

    const ownerRepo = resolveOwnerRepo(ownerOrOwnerRepo, this.repository)
    if (ownerRepo === null) {
      return null
    }

    let [owner, repo] = ownerRepo
    if (owner !== undefined && repo !== undefined) {
      text = `${ownerOrOwnerRepo}${text}`
    } else {
      owner = this.repository.owner.login
      repo = this.repository.name
    }

    const baseHref = getHTMLURL(this.repository.endpoint)
    // We are choosing to use issues as GitHub will redirect an issues url to
    // pull requests and discussions as needed. However, if a user erroneously
    // referenced a pull request #2 with /discussions/2 marker, and we were to use
    // `discussions` because of that, the user would end up at a not found page.
    // This way they will end up at the pull request (same behavior in dotcom).
    const href = `${baseHref}/${owner}/${repo}/issues/${refNumber}`

    const anchor = document.createElement('a')
    anchor.textContent = text
    anchor.href = href
    return anchor
  }
}
