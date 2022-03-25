import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../api'
import { INodeFilter } from './node-filter'

/**
 * The Mention Markdown filter looks for user logins and replaces them with
 * links the users profile. Specifically looking at text nodes and if a
 * reference like @user is found, it will replace the text node with three nodes
 * - one being a link.
 *
 * Mentions in <pre>, <code> and <a> elements are ignored. Contrary to dotcom
 * where it confirms whether the user exists or not, we assume they do exist for
 * the sake of performance (not doing database hits to see if the mentioned user
 * exists)
 *
 * Example: A text node of "That is great @tidy-dev! Good Job!"
 * Becomes three nodes:
 * 1) "That is great "
 * 2) <link src="github.com/tidy-dev">@tidy-dev</link>
 * 3) "! Good Job!"
 */
export class MentionFilter implements INodeFilter {
  // beginning of string or non-word, non-` char
  private readonly beginStringNonWord = /(^|[^a-zA-Z0-9_`])/

  // @username and @username_emu for enterprise managed users support
  private readonly userNameRef =
    /(?<userNameRef>@[a-z0-9][a-z0-9-]*_[a-zA-Z0-9]+|@[a-z0-9][a-z0-9-]*)/

  // without a trailing slash
  private readonly withoutTrailingSlash = /(?!\/)/

  // dots followed by space or non-word character
  private readonly dotsFollowedBySpace = /\.+[\t\W]/

  // dots at end of line
  private readonly dotsAtEndOfLine = /\.+$/

  // non-word character except dot, ` , or -
  // Note: In the case of usernames, the hyphen is a word character.
  private readonly nonWordExceptDotOrBackTickOrHyphen = /[^0-9a-zA-Z_.`-]/

  // Pattern used to extract @mentions from text
  // Looking for @user or @user_user
  // Note: Enterprise managed users may have underscores
  private readonly mentionRegex = new RegExp(
    this.beginStringNonWord.source +
      this.userNameRef.source +
      this.withoutTrailingSlash.source +
      '(?=' +
      this.dotsFollowedBySpace.source +
      '|' +
      this.dotsAtEndOfLine.source +
      '|' +
      this.nonWordExceptDotOrBackTickOrHyphen.source +
      '|' +
      '$)', // end of line
    'ig'
  )

  public constructor(
    /** The repository which the markdown content originated from */
    private readonly repository: GitHubRepository
  ) {}

  /**
   * Mention filters iterates on all text nodes that are not inside a pre, code,
   * or anchor tag.
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
   * Takes a text node and creates multiple text and link nodes by inserting
   * user link nodes where username references are.
   *
   * Warning: This filter can create false positives. It assumes the users exist.
   *
   * Note: Mention filter requires text nodes; otherwise we may inadvertently
   * replace non text elements.
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    const { textContent: text } = node
    if (
      node.nodeType !== node.TEXT_NODE ||
      text === null ||
      !text.includes('@')
    ) {
      return null
    }

    let lastMatchEndingPosition = 0
    const nodes: Array<Text | HTMLAnchorElement> = []
    const matches = text.matchAll(this.mentionRegex)
    for (const match of matches) {
      if (match.groups === undefined || match.index === undefined) {
        continue
      }

      const { userNameRef } = match.groups
      if (userNameRef === undefined) {
        continue
      }

      const link = this.createLinkElement(userNameRef)
      const refPosition = match.index === 0 ? 0 : match.index + 1
      const textBefore = text.slice(lastMatchEndingPosition, refPosition)
      const textNodeBefore = document.createTextNode(textBefore)
      nodes.push(textNodeBefore)
      nodes.push(link)

      lastMatchEndingPosition = refPosition + (userNameRef.length ?? 0)
    }

    const trailingText = text.slice(lastMatchEndingPosition)
    if (trailingText !== '') {
      nodes.push(document.createTextNode(trailingText))
    }

    return nodes
  }

  /**
   * Method to create the user mention anchor.
   **/
  private createLinkElement(userNameRef: string) {
    const baseHref = getHTMLURL(this.repository.endpoint)
    const href = `${baseHref}/${userNameRef.slice(1)}`
    const anchor = document.createElement('a')
    anchor.textContent = userNameRef
    anchor.href = href
    return anchor
  }
}
