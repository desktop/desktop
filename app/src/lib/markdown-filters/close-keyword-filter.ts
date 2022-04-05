import { INodeFilter } from './node-filter'

export class CloseKeywordFilter implements INodeFilter {
  public createFilterTreeWalker(doc: Document): TreeWalker {
    throw new Error('Method not implemented.')
  }

  public filter(node: Node): Promise<readonly Node[] | null> {
    throw new Error('Method not implemented.')
  }
}
