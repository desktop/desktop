export interface INodeFilter {
  /**
   * Creates a document tree walker filtered to the nodes relevant to the node filter.
   *
   * Examples:
   * 1) An Emoji filter operates on all text nodes.
   * 2) The issue mention filter operates on all text nodes, but not inside pre, code, or anchor tags
   */
  createFilterTreeWalker(doc: Document): TreeWalker

  /**
   * This filter accepts a document node and searches for it's pattern within it.
   *
   * If found, returns an array of nodes to replace the node with.
   *    Example: [Node(contents before match), Node(match replacement), Node(contents after match)]
   * If not found, returns null
   *
   * This is asynchronous as some filters have data must be fetched or, like in
   * emoji, the conversion to base 64 data uri is asynchronous
   * */
  filter(node: Node): Promise<ReadonlyArray<Node> | null>
}

