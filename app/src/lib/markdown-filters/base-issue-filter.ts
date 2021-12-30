import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../../ui/dispatcher'
import { INodeFilter } from './node-filter'

/**
 * The Base Issue Mention filter has shared functionality of the issue mention
 * filter and issue link filter  for obtaining and caching the reference url of
 * an issue mention.
 *
 */
export class BaseIssueFilter implements INodeFilter {
  /** App dispatcher used to retrieve/verify issue, pull request, and discussion urls. */
  private readonly dispatcher: Dispatcher

  /** The parent github repository of which the content the filter is being applied to belongs  */
  protected readonly repository: GitHubRepository

  /** Cache of retrieved url references such that we don't keep repeating api calls */
  private readonly referencesUrlCache: Map<string, string | null> = new Map()

  public constructor(dispatcher: Dispatcher, repository: GitHubRepository) {
    this.dispatcher = dispatcher
    this.repository = repository
  }

  /**
   * Returns tree walker iterates on all text nodes that are not inside a pre, code, or anchor tag.
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

  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    return null
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
  protected resolveOwnerRepo(
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
  protected async getReferencesURL(
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
}
