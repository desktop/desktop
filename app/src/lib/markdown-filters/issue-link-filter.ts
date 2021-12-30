import { getHTMLURL } from '../api'
import { fatalError } from '../fatal-error'
import { escapeRegExp } from '../helpers/regex'
import { BaseIssueFilter } from './base-issue-filter'

/**
 * The Issue Link filter matches the target and text of an anchor element that
 * is an issue, pull request, or discussion and changes the text to a uniform
 * reference.
 *
 * Example:
 * <a href="https://github.com/github/github/issues/99872">https://github.com/github/github/issues/99872</a>
 * Becomes
 * <a href="https://github.com/github/github/issues/99872">#99872</a>
 *
 * Additionally if a link has an anchor tag such as #discussioncomment-1858985.
 * We will append a relevant description.
 *
 * The intention behind this node filter is for use after the markdown parser
 * that has taken raw urls and auto tagged them them as anchor elements.
 */
export class IssueLinkFilter extends BaseIssueFilter {
  /** A regexp that searches for the owner/name pattern in issue href */
  private readonly nameWithOwner = /(?<nameWithOwner>\w+(?:-\w+)*\/[.\w-]+)/

  /** A regexp that searches for the number and #anchor of an issue reference */
  private readonly numberWithAnchor = /(?<refNumber>\d+)(?<anchor>#[\w-]+)?\b/

  /**
   * Issue link mention filter iterates on all anchor elements that are not
   * inside a pre, code, or anchor tag and resemble an issue, pull request, or
   * discussion link and their href matches their inner text.
   *
   * Looking something like:
   * <a href="https://github.com/github/github/issues/99872">https://github.com/github/github/issues/99872</a>
   * Where the href could be:
   * - https://github.com/github/github/issues/99872
   * - https://github.com/github/github/pulls/99872
   * - https://github.com/github/github/discussions/99872
   * - https://github.com/github/github/discussions/99872#discussioncomment-1858985
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const filter = this
    return doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el: Element) {
        return (el.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(el.parentNode.nodeName)) ||
          !(el instanceof HTMLAnchorElement) ||
          el.href !== el.innerText ||
          !filter.isGitHubIssuePullDiscussionLink(el)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  /**
   * Returns true if the given anchor element is a link to a GitHub issue,
   * discussion, or the default tab of a pull request.
   */
  private isGitHubIssuePullDiscussionLink(anchor: HTMLAnchorElement) {
    const isIssuePullOrDiscussion = /(issue|pull|discussion)/.test(anchor.href)
    if (!isIssuePullOrDiscussion) {
      return false
    }

    const isPullRequestTab = /\d+\/(files|commits|conflicts|checks)/.test(
      anchor.href
    )
    if (isPullRequestTab) {
      return false
    }

    const isURlCustomFormat = /\.[a-z]+\z/.test(anchor.href)
    if (isURlCustomFormat) {
      return false
    }

    const isIssue = this.getFullUrlIssueMentionRegexp().test(anchor.href)
    if (isIssue) {
      return true
    }

    const isDiscussion = this.getFullUrlDiscussionMentionRegexp().test(
      anchor.href
    )

    return isDiscussion
  }

  private getFullUrlIssueMentionRegexp(): RegExp {
    return this.getFullURLMentionRegexp(/(?:issues|pull)/)
  }

  private getFullUrlDiscussionMentionRegexp(): RegExp {
    return this.getFullURLMentionRegexp(/(?:discussions)/)
  }

  private getFullURLMentionRegexp(mentionTypeRegex: RegExp) {
    const gitHubURL = getHTMLURL(this.repository.endpoint)
    return new RegExp(
      escapeRegExp(gitHubURL) +
        '/' +
        this.nameWithOwner.source +
        '/' +
        mentionTypeRegex.source +
        '/' +
        this.numberWithAnchor.source
    )
  }

  /**
   * Takes an anchor element that's href and inner text looks like a github
   * references and prepares an anchor element with a consistent issue reference
   * as the inner text to replace it with.
   *
   * Example:
   * Anchor tag of = <a href="https://github.com/owner/repo/issues/1234">https://github.com/owner/repo/issues/1234</a>
   * Output = [<a href="https://github.com/owner/repo/issues/1234">#1234</a>]
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    if (!(node instanceof HTMLAnchorElement)) {
      fatalError(
        'Issue filter requires text nodes; otherwise we may inadvertently replace non text elements.'
      )
    }

    const { textContent: text } = node
    if (text === null) {
      // Based on tree walker criteria, this shouldn't happen and is just a
      // typing check.
      return null
    }

    // let lastMatchEndingPosition = 0
    // const nodes: Array<Text | HTMLAnchorElement> = []
    // Is either an issue or a discussion
    const isIssue = this.getFullUrlIssueMentionRegexp().test(text)
    const match = isIssue
      ? text.match(this.getFullUrlIssueMentionRegexp())
      : text.match(this.getFullUrlDiscussionMentionRegexp())

    if (match === null || match.groups === undefined) {
      return null
    }

    const { nameWithOwner, refNumber, anchor } = match.groups
    if (nameWithOwner === undefined || refNumber === undefined) {
      return null
    }

    const referenceURL = await this.getReferencesURL(refNumber, nameWithOwner)

    if (referenceURL === null) {
      return null
    }

    const newNode = node.cloneNode(true)
    newNode.textContent = this.getConsistentIssueReferenceText(
      refNumber,
      anchor
    )

    return [newNode]
  }

  /** Creates a standard issue references and description.
   *
   * Examples:
   *  Issue 1 => #1
   *  Issue 1#discussion-comment-1234 => #1 (comment)
   */
  private getConsistentIssueReferenceText(refNumber: string, anchor?: string) {
    const text = `#${refNumber}`
    const anchorDescription = this.getAnchorDescription(anchor)

    return `${text}${anchorDescription}`
  }

  private getAnchorDescription(anchor: string | undefined) {
    if (anchor === undefined) {
      return ''
    }

    switch (true) {
      case /discussion-diff-/.test(anchor):
        return '(diff)'
      case /commits-pushed-/.test(anchor):
        return '(commits)'
      case /ref-/.test(anchor):
        return '(reference)'
      case /pullrequestreview/.test(anchor):
        return '(review)'
      // case /discussioncomment-/.test(anchor):
      // If threaded, requires an api call to determine
      // return '(reply in thread)'
    }

    return '(comment)'
  }
}
