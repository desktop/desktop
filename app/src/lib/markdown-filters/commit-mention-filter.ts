import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../api'
import { INodeFilter } from './node-filter'
import { resolveOwnerRepo } from './resolve-owner-repo'

/**
 * The Commit Mention Filter matches for sha patterns and replaces them with
 * links to sha and concatenates long ones.
 *
 * There are three sha patterns:
 *   1) SHA (7-40 hex characters)
 *   2) SHA...SHA
 *   3) user/repo@SHA
 *
 * Notes:
 *  1) When no user/repo is provided, the link defaults to the provided repo
 *     owner and/or repo name.
 *  2) Notable difference from dotcom approach is that, it does not verify
 *     commit exists in the given repo context. (To note, dotcom doesn't verify
 *     for repo's outside of the markdown context.) This improves performance at
 *     the cost of false-positives. Additionally, all commit shas are trimmed to
 *     7 characters, if >= 30 characters, unlike dotcom that obtains the git
 *     short sha for shas in the markdown context.
 *
 * Example: A text node of "Check out desktop/desktop@123456781012134543265 for
 * an idea of how to do it..." Becomes three nodes:
 * 1) "Check out "
 * 2) <link src="github.com/desktop/desktop/commit/123456781012134543265">desktop/desktop@<tt>1234567<tt></link>
 * 3) " for an idea of how to do it..."
 */
export class CommitMentionFilter implements INodeFilter {
  /** A commit reference can start at beginning of a string or be prefaced by a whitespace character, (, {, or [ */
  private readonly sharedLeader = /^|[\s({\[]/

  /** Some references also can be prefaced with an @ */
  private readonly sharedLeaderWithAt = new RegExp(
    this.sharedLeader.source + '|@'
  )

  /**
   * Some references can be prefaced with .. or ...
   * Notes: not using quantify pattern so it can be used in a positive look behind
   */
  private readonly sharedLeaderWithAtAndDots = new RegExp(
    this.sharedLeaderWithAt.source + '|' + /\.\.|\.\.\./.source
  )

  /** Sha */
  private readonly sha = /[0-9a-f]{7,40}/

  /** Sha followed by a non-word character **/
  private readonly endBoundedSha = new RegExp(this.sha.source + /\b/.source)

  /**
   * Looking for SHA...SHA
   * At start of string or prefaced with space like character, (, {, @, or [
   * Suffixed by a word boundary character such as a space or a period.
   *
   * Examples:
   * 1234567...1234567
   * 1234567...1234567.
   *  1234567...1234567
   * [1234567...1234567,
   * {1234567...1234567,
   * (1234567...1234567
   * */
  private readonly shaRange = new RegExp(
    '(?<shaRange>' +
      // Positive look behind for start of string, (, {, @, or [
      '(?<=' +
      this.sharedLeaderWithAt.source +
      ')' +
      // first sha
      '(?<firstSha>' +
      this.sha.source +
      ')' +
      // The joiner ...
      /\.\.\./.source +
      // last sha
      '(?<lastSha>' +
      this.sha.source +
      ')' +
      ')' +
      // must be followed by boundary character (but not part of shaRange)
      /\b/.source
  )

  /**
   * Looking for a commit
   *
   * Examples:
   * 1234567
   * ..1234567
   * ...1234567
   * (1234567
   * {1234567
   * 1234567
   * [1234567
   * 1234567.
   * (But not 1234567L (l is not 0-9a-f))
   */
  private boundedSha = new RegExp(
    '(?<boundedSha>' +
      // Positive look behind for start of string, (, {, @, [, .., or ...
      '(?<=' +
      this.sharedLeaderWithAtAndDots.source +
      ')' +
      '(?<rawBoundedSha>' +
      this.sha.source +
      ')' +
      ')' +
      // must be followed by boundary character (but not part of shaRange)
      /\b/.source
  )

  /** Matches for 'user' or 'user/repo' */
  private readonly ownerOrOwnerRepo = /(?<ownerOrOwnerRepo>[\w-]+\/?[\w.-]*)/

  /**
   * Loosely looking for user@sha or user/repo@sha
   *
   * tidy-dev@1234567
   * tidy-dev/test@1234567
   */
  private readonly ownerSpecifiedSha = new RegExp(
    '(?<ownerSpecifiedSha>' +
      // Positive look behind for start of string, (, {, , or [
      '(?<=' +
      this.sharedLeader.source +
      ')' +
      this.ownerOrOwnerRepo.source +
      '@' +
      '(?<ownerSha>' +
      this.sha.source +
      ')' +
      /\b/.source +
      ')'
  )

  private readonly commitShaRegexUnion = new RegExp(
    this.shaRange.source +
      '|' +
      this.ownerSpecifiedSha.source +
      '|' +
      this.boundedSha.source,
    'g'
  )

  public constructor(
    /** The repository which the markdown content originated from */
    private readonly repository: GitHubRepository
  ) {}

  /**
   * Commit mention filters iterates on all text nodes that are not inside a pre,
   * code, or anchor tag. The text node would also at a minimum not be null and
   * end in a commit sha.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        return (node.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(node.parentNode.nodeName)) ||
          node.textContent === null ||
          !this.endBoundedSha.test(node.textContent)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  /**
   * Takes a text node and creates multiple text and link nodes by inserting
   * commit sha link nodes where commit mentions are.
   *
   * Warning: This filter can create false positives. It assumes the commits exist.
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    const { textContent: text } = node
    if (node.nodeType !== node.TEXT_NODE || text === null) {
      return null
    }

    const matches = [...text.matchAll(this.commitShaRegexUnion)]
    if (matches.length === 0) {
      return null
    }

    let lastMatchEndingPosition = 0
    const nodes: Array<Text | HTMLAnchorElement> = []
    for (const match of matches) {
      if (match.groups === undefined || match.index === undefined) {
        continue
      }

      const link = this.createLink(match.groups)
      // This is possible because owner specified regex could match on invalid
      // owner/repo based on the repo this markdown is from.
      if (link === undefined) {
        continue
      }

      const textBefore = text.slice(lastMatchEndingPosition, match.index)
      nodes.push(document.createTextNode(textBefore))
      nodes.push(link)

      const { shaRange, ownerSpecifiedSha, boundedSha } = match.groups
      lastMatchEndingPosition =
        match.index + (shaRange ?? ownerSpecifiedSha ?? boundedSha ?? '').length
    }

    const trailingText = text.slice(lastMatchEndingPosition)
    if (trailingText !== '') {
      nodes.push(document.createTextNode(trailingText))
    }

    return nodes
  }

  /**
   * Method to determine what kind of link to make depending on which commit
   * mention regex was matched.
   *
   * The names group names names are defined in regex's: this.shaRange,
   * this.ownerSpecifiedSha, this.boundedSha
   */
  private createLink(matchGroups: { [key: string]: string }) {
    const {
      shaRange,
      firstSha,
      lastSha,
      ownerSpecifiedSha,
      ownerOrOwnerRepo,
      ownerSha,
      boundedSha,
      rawBoundedSha,
    } = matchGroups

    if (shaRange !== undefined) {
      return this.createCommitShaRangeLinkElement(firstSha, lastSha)
    }

    if (ownerSpecifiedSha !== undefined) {
      return this.createOwnerSpecifiedCommitLinkElement(
        ownerOrOwnerRepo,
        ownerSha
      )
    }

    if (boundedSha !== undefined) {
      return this.createCommitMentionLinkElement(
        this.trimCommitSha(rawBoundedSha),
        'commit'
      )
    }

    return
  }

  /**
   * Method to create a commit sha mention link element for a sha range
   **/
  private createCommitShaRangeLinkElement(firstSha: string, lastSha: string) {
    return this.createCommitMentionLinkElement(
      `${this.trimCommitSha(firstSha)}...${this.trimCommitSha(lastSha)}`,
      'compare'
    )
  }

  /**
   * Method to create a commit sha mention link element for an owner specified
   * commit sha
   **/
  private createOwnerSpecifiedCommitLinkElement(
    ownerOrOwnerRepo: string,
    sha: string
  ) {
    const ownerAndRepo = resolveOwnerRepo(ownerOrOwnerRepo, this.repository)

    // It was an owner only and it wasn't the owner of this repo (or otherwise
    // bad data), so we don't have repo name to link it to.
    if (ownerAndRepo === null) {
      return
    }

    const trimmedSha = this.trimCommitSha(sha)
    // It was the owner of this repo or empty array because it matched this
    // repository, either we just want to ignore it.
    if (ownerAndRepo.length < 2) {
      return this.createCommitMentionLinkElement(trimmedSha)
    }

    // Otherwise, a owner and repo name outside of the context of this markdown
    // was given and needs to be specified
    const [repoOwner, repoName] = ownerAndRepo
    return this.createCommitMentionLinkElement(
      trimmedSha,
      'commit',
      repoOwner,
      repoName,
      `${repoOwner}/${repoName}@`
    )
  }

  /**
   * Method to create a commit mention link element.
   *
   * If for a range, it links to a 'compare' view
   * If for a commit, it links to a 'commit' view (default)
   **/
  private createCommitMentionLinkElement(
    ref: string,
    view: 'commit' | 'compare' = 'commit',
    repoOwner: string = this.repository.owner.login,
    repoName: string = this.repository.name,
    refPreface?: string
  ) {
    const baseHref = getHTMLURL(this.repository.endpoint)
    const href = `${baseHref}/${repoOwner}/${repoName}/${view}/${ref}`
    const anchor = document.createElement('a')
    anchor.innerHTML = `${refPreface ?? ''}<tt>${ref}</tt>`
    anchor.href = href
    return anchor
  }

  /**
   * Method to trim the shas
   *
   * If sha >= 30, trimmed to first 7
   */
  private trimCommitSha(sha: string) {
    return sha.length >= 30 ? sha.slice(0, 7) : sha
  }
}
