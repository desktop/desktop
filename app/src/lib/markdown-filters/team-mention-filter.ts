import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../api'
import { caseInsensitiveEquals } from '../compare'
import { INodeFilter } from './node-filter'

/**
 * The Mention Markdown filter looks for team mention in an organization's repo
 * and replaces them with links to teams profile. Specifically looking at text
 * nodes and if a reference like @org/teamname is found, it will replace the
 * text node with three nodes - one being a link.
 *
 * Team mentions in <pre>, <code> and <a> elements are ignored.
 *
 * Contrary to dotcom where it confirms whether the team exists or not, we
 * assume they do exist for the sake of performance (not doing database hit to
 * see if the mentioned user exists).
 *
 * Example: A text node of "cc: @desktop/the-a-team - Got have the a teams input..."
 * Becomes three nodes:
 * 1) "cc: "
 * 2) <link src="github.com/orgs/desktop/teams/the-a-team">@desktop/the-a-team</link>
 * 3) " - Got have the a teams input..."
 */
export class TeamMentionFilter implements INodeFilter {
  // beginning of string or non-word char
  private readonly beginStringNonWordRegix = /(^|\W)/

  // @organization part of @organization/team
  private readonly orgRegix = /(?<org>@[a-z0-9][a-z0-9-]*)/

  // the /team part of @organization/team
  private readonly teamRegix = /(?<team>\/[a-z0-9][a-z0-9\-_]*)/

  // Pattern used to extract @org/team mentions from text
  private readonly teamMentionRegex = new RegExp(
    this.beginStringNonWordRegix.source +
      this.orgRegix.source +
      this.teamRegix.source +
      /\b/.source, // assert position at a word boundary
    'ig'
  )

  public constructor(
    /** The repository which the markdown content originated from */
    private readonly repository: GitHubRepository
  ) {}

  /**
   * Team mention filters iterates on all text nodes that are not inside a pre,
   * code, or anchor tag. The text node would also at a minimum not be null and
   * include the @ symbol.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        return (node.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(node.parentNode.nodeName)) ||
          node.textContent === null ||
          !node.textContent.includes('@')
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  /**
   * Takes a text node and creates multiple text and link nodes by inserting
   * team link nodes where team mentions are.
   *
   * Warning: This filter can create false positives. It assumes the teams exist.
   *
   * Note: Team mention filter requires text nodes; otherwise we may inadvertently
   * replace non text elements.
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    const { textContent: text } = node
    if (
      node.nodeType !== node.TEXT_NODE ||
      text === null ||
      // If the repo is not owned by an org, then there cannot be teams.
      this.repository.owner.type !== 'Organization'
    ) {
      return null
    }

    let lastMatchEndingPosition = 0
    const nodes: Array<Text | HTMLAnchorElement> = []
    const matches = text.matchAll(this.teamMentionRegex)
    for (const match of matches) {
      if (match.groups === undefined || match.index === undefined) {
        continue
      }

      const { org, team } = match.groups
      if (
        org === undefined ||
        team === undefined ||
        // Team references are only added when the repository owner is the org to prevent linking to a team outside the repositories org.
        caseInsensitiveEquals(org.slice(1), this.repository.owner.login)
      ) {
        continue
      }

      const link = this.createLinkElement(org.slice(1), team.slice(1))
      const refPosition = match.index === 0 ? 0 : match.index + 1
      const textBefore = text.slice(lastMatchEndingPosition, refPosition)
      const textNodeBefore = document.createTextNode(textBefore)
      nodes.push(textNodeBefore)
      nodes.push(link)

      lastMatchEndingPosition = refPosition + org.length + team.length
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
  private createLinkElement(org: string, team: string) {
    const baseHref = getHTMLURL(this.repository.endpoint)
    const href = `${baseHref}/orgs/${org}/teams/${team}`
    const anchor = document.createElement('a')
    anchor.textContent = `@${org}/${team}`
    anchor.href = href
    return anchor
  }
}
