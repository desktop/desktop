import { IssueReference } from './issue-mention-filter'
import { INodeFilter, MarkdownContext } from './node-filter'

/** Markdown locations that can have closing keywords */
const IssueClosingContext: ReadonlyArray<MarkdownContext> = [
  'Commit',
  'PullRequest',
]

/** Determines if markdown context could have issue closing mention */
export function isIssueClosingContext(markdownContext: MarkdownContext) {
  return IssueClosingContext.includes(markdownContext)
}

export class CloseKeywordFilter implements INodeFilter {
  /**
   * Searches for the words: close, closes, closed, fix, fixes, fixed, resolve,
   * resolves, resolved
   *
   * Expects one or more spaces at the end to avoid false matches like
   * owner/fixops#1
   */
  private closeText =
    /\b(?<close_text>close[sd]?|fix(e[sd])?|resolve[sd]?)(?<close_spacer>\s*:?\s+)/i

  private closesWithTextReference = new RegExp(
    this.closeText.source + '(?<issue_reference>' + IssueReference.source + ')',
    'i'
  )

  private closesAtEndOfText = new RegExp(
    this.closeText.source + /$/.source,
    'i'
  )

  /** Markdown locations that can have closing keywords */
  private issueClosingLocations: ReadonlyArray<MarkdownContext> = [
    'Commit',
    'PullRequest',
  ]

  public constructor(
    /** The context from which the markdown content originated from - such as a PullRequest or PullRequest Comment */
    private readonly markdownContext: MarkdownContext
  ) {}

  /**
   *  Close keyword filter iterates on all text nodes that are not inside a pre,
   *  code, or anchor tag.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        return (node.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(node.parentNode.nodeName)) ||
          node.textContent === null
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    if (!this.issueClosingLocations.includes(this.markdownContext)) {
      return null
    }

    console.log(this.closesWithTextReference)
    console.log(this.closesAtEndOfText)

    return null
  }
}
