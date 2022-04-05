import { INodeFilter, MarkdownContext } from './node-filter'

export class CloseKeywordFilter implements INodeFilter {
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
        return node.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(node.parentNode.nodeName)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    if (!this.issueClosingLocations.includes(this.markdownContext)) {
      return null
    }

    return null
  }
}
