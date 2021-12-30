import { fatalError } from '../fatal-error'
import { BaseIssueFilter } from './base-issue-filter'

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
 *                     (assuming the user has access to this external repo)
 *
 *   - marker: Required #, gh-, /issues/, /pull/, or /discussions/
 *   - number: Required and must be digits followed by a word bounding
 *             character. (whitespace or period)
 *
 */
export class IssueMentionFilter extends BaseIssueFilter {
  /** A regular expression to match a group of any digit follow by a word
   * bounding character. */
  private readonly refNumber = /(?<refNumber>\d+)\b/

  /** A regular expression to match a group of an repo name or name with owner
   * Example: github/github or github  */
  private readonly ownerOrOwnerRepo = /(?<ownerOrOwnerRepo>\w+(?:-\w+)*(?:\/[.\w-]+)?)/

  /** A regular expression to match a group possible preceding markers are
   * gh-, #, /issues/, /pull/, or /discussions/ followed by a digit
   */
  private readonly marker = /(?<marker>#|gh-|\/(?:issues|pull|discussions)\/)(?=\d)/
  // `(?<marker>#|gh-|\/(?:issues|pull|discussions)\/)(?=\\d)`
  //?<marker>
  // MARKER = %r<(?:#|gh-|/(?:issues|pull|discussions)/)(?=\d)>i
  /**
   * A regular expression string of a lookbehind is used so that valid
   * matches for the issue reference have the leader precede them but the leader
   * is not considered part of the match. An issue reference much have a
   * whitespace, beginning of line, or some other non-word character must
   * preceding it.
   * */
  private readonly leader = /(?<=^|\W)/

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
    this.leader.source +
      this.ownerOrOwnerRepo.source +
      '?' +
      this.marker.source +
      this.refNumber.source,
    'ig'
  )

  /**
   * Takes a text node and creates multiple text and image nodes by inserting
   * anchor tags where the references are if the references can be verified as
   * an issue, pull request, or discussion.
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

      const { marker, refNumber, ownerOrOwnerRepo } = match.groups
      if (marker === undefined || refNumber === undefined) {
        continue
      }

      const referenceURL = await this.getReferencesURL(
        refNumber,
        ownerOrOwnerRepo
      )

      if (referenceURL === null) {
        continue
      }

      const textBefore = text.slice(lastMatchEndingPosition, match.index)
      const textNodeBefore = document.createTextNode(textBefore)
      nodes.push(textNodeBefore)

      const link = this.createLinkElement(
        referenceURL,
        marker,
        refNumber,
        ownerOrOwnerRepo
      )
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
   * then returns a text node as this would indicate an invalid reference.
   */
  private createLinkElement(
    href: string,
    marker: string,
    refNumber: string,
    ownerOrOwnerRepo?: string
  ) {
    let text = `${marker}${refNumber}`

    const ownerRepo = this.resolveOwnerRepo(ownerOrOwnerRepo)
    if (ownerRepo === null) {
      // Technically, this shouldn't happen at this point since we have a href,
      // but if it did it means we had in invalid reference due to owner/repo
      // prefacing the issue references and we just want to put a text node
      // back.
      return document.createTextNode(`${ownerOrOwnerRepo}${text}`)
    }

    const keyOwnerRepoPreface = ownerRepo.length === 2 ? ownerOrOwnerRepo : ''
    text = `${keyOwnerRepoPreface}${text}`

    const anchor = document.createElement('a')
    anchor.textContent = text
    anchor.href = href
    return anchor
  }
}
