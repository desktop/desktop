import escapeRegExp from 'lodash/escapeRegExp'
import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../api'
import { INodeFilter } from './node-filter'

/** Return a regexp that matches a full issue, pull request, or discussion url
 * including the anchor */
export function issueUrl(repository: GitHubRepository): RegExp {
  const gitHubURL = getHTMLURL(repository.endpoint)
  return new RegExp(
    escapeRegExp(gitHubURL) +
      '/' +
      /** A regexp that searches for the owner/name pattern in issue href */
      /(?<nameWithOwner>\w+(?:-\w+)*\/[.\w-]+)/.source +
      '/' +
      /(?:issues|pull|discussions)/.source +
      '/' +
      /** A regexp that searches for the number and #anchor of an issue reference */
      /(?<refNumber>\d+)(?<anchor>#[\w-]+)?\b/.source
  )
}

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
export class IssueLinkFilter implements INodeFilter {
  public constructor(
    /** The repository which the markdown content originated from */
    private readonly repository: GitHubRepository
  ) {}

  /**
   * Issue link mention filter iterates on all anchor elements that are not
   * inside a pre, code, or anchor tag and resemble an issue, pull request, or
   * discussion link and their href matches their inner text.
   *
   * Looking for something like:
   * <a href="https://github.com/github/github/issues/99872">https://github.com/github/github/issues/99872</a>
   * Where the href could be like:
   * - https://github.com/github/github/issues/99872
   * - https://github.com/github/github/pulls/99872
   * - https://github.com/github/github/discussions/99872
   * - https://github.com/github/github/discussions/99872#discussioncomment-1858985
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (el: Element) => {
        return (el.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(el.parentNode.nodeName)) ||
          !(el instanceof HTMLAnchorElement) ||
          el.href !== el.innerText ||
          !this.isGitHubIssuePullDiscussionLink(el)
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

    return issueUrl(this.repository).test(anchor.href)
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
    const { textContent: text } = node
    if (!(node instanceof HTMLAnchorElement) || text === null) {
      return null
    }

    const match = text.match(issueUrl(this.repository))
    if (match === null || match.groups === undefined) {
      return null
    }

    const { refNumber, anchor } = match.groups
    const newNode = node.cloneNode(true)
    newNode.textContent = this.getConsistentIssueReferenceText(
      refNumber,
      anchor
    )

    return [newNode]
  }

  /**
   * Creates a standard issue references and description.
   *
   * Examples:
   *  Issue 1 => #1
   *  Issue 1#discussion-comment-1234 => #1 (comment)
   */
  private getConsistentIssueReferenceText(refNumber: string, anchor?: string) {
    const text = `#${refNumber}`
    const anchorDescription = this.getAnchorDescription(anchor)
    return `${text} ${anchorDescription}`
  }

  /**
   * Provides generic description for a provided href anchor.
   *
   * Example: An anchor "#commits-pushed-1234" returns "(commits)".
   *
   * If the anchor does not fit a common anchor type , it defaults `(comment)`
   */
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
      // Note: On dotcom, there is an additional case
      // /discussioncomment-/.test(anchor): and a check for threaded that
      // returns '(reply in thread)' as opposed to '(comment)', but this would
      // require an api call to determine.
    }

    return '(comment)'
  }
}
