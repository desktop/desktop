import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../../ui/dispatcher'
import { fatalError } from '../fatal-error'
import { INodeFilter } from './node-filter'

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
export class IssueMentionFilter implements INodeFilter {
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

  /** App dispatcher used to retrieve/verify issue, pull request, and discussion urls. */
  private readonly dispatcher: Dispatcher

  /** The parent github repository of which the content the filter is being applied to belongs  */
  private readonly repository: GitHubRepository

  /** Cache of retrieved url references such that we don't keep repeating api calls */
  private readonly referencesUrlCache: Map<string, string | null> = new Map()

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
   * The ownerOrOwnerRepo may be of the form owner or owner/repo.
   * 1) If owner/repo and they don't both match the current repo, then we return
   *    them as to distinguish them as a different from the current repo for the
   *    reference url.
   * 2) If (owner) and the owner !== current repo owner, it is an invalid
   *    references - return null.
   * 3) Otherwise, return [] as it is an valid references, but, in the current
   *    repo and is redundant owner/repo info.
   */
  private resolveOwnerRepo(
    ownerOrOwnerRepo: string | undefined
  ): ReadonlyArray<string> | null {
    if (ownerOrOwnerRepo === undefined) {
      return []
    }

    const ownerAndRepo = ownerOrOwnerRepo.split('/')
    if (ownerAndRepo.length > 3) {
      // Invalid data
      return null
    }

    // If owner and repo are provided, we only care if they differ from the current repo.
    if (
      ownerAndRepo.length === 2 &&
      (ownerAndRepo[0] !== this.repository.owner.login ||
        ownerAndRepo[1] !== this.repository.name)
    ) {
      return ownerAndRepo
    }

    if (
      ownerAndRepo.length === 1 &&
      ownerAndRepo[0] !== this.repository.owner.login
    ) {
      return null
    }

    return []
  }

  /** Checks a references url cache and if not present, retrieves it and sets cache if not null */
  private async getReferencesURL(
    refNumber: string,
    ownerOrOwnerRepo?: string
  ): Promise<string | null> {
    let refKey = `${refNumber}`

    const ownerRepo = this.resolveOwnerRepo(ownerOrOwnerRepo)
    if (ownerRepo === null) {
      // We had in invalid reference due to owner/repo prefacing the issue
      // references.
      return null
    }

    const keyOwnerRepoPreface = ownerRepo.length === 2 ? ownerOrOwnerRepo : ''
    refKey = `${keyOwnerRepoPreface}${refKey}`

    const cachedReferenceUrl = this.referencesUrlCache.get(refKey)
    if (cachedReferenceUrl !== undefined) {
      return cachedReferenceUrl
    }

    const [owner, repo] = ownerRepo
    const referencesURL = await this.dispatcher.fetchIssueOrDiscussionURL(
      this.repository,
      refNumber,
      owner,
      repo
    )

    this.referencesUrlCache.set(refKey, referencesURL)

    return referencesURL
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
