import escapeRegExp from 'lodash/escapeRegExp'
import { GitHubRepository } from '../../models/github-repository'
import { getHTMLURL } from '../api'
import { INodeFilter } from './node-filter'

/**
 * The Commit mention Link filter matches the target and text of an anchor element that
 * is an commit mention link and changes the text to a uniform
 * reference.
 *
 * Types of commit mention links:
 * - Plain Single Commit: https://github.com/desktop/desktop/commit/6fd794543af171c35cc9c325f570f9553128ffc9
 * - Compare a range of Commits: https://github.com/desktop/desktop/compare/6fd794543...6fd794543
 * - Pull Request Commit: https://github.com/desktop/desktop/pull/14239/commits/6fd794543af171c35cc9c325f570f9553128ffc9
 *
 * Example:
 * <a href="https://github.com/desktop/desktop/commit/6fd794543af171c35cc9c325f570f9553128ffc9">https://github.com/desktop/desktop/commit/6fd794543af171c35cc9c325f570f9553128ffc9</a>
 *
 * Becomes
 * <a href="https://github.com/desktop/desktop/commit/6fd794543af171c35cc9c325f570f9553128ffc9">6fd7945</a>
 *
 * or this, if not owned by current repository,
 * <a href="https://github.com/desktop/desktop/commit/6fd794543af171c35cc9c325f570f9553128ffc9">desktop/desktop@6fd7945</a>
 *
 *
 * The intention behind this node filter is for use after the markdown parser
 * that has taken raw urls and auto tagged them them as anchor elements.
 *
 * Trailing filepath and query parameters: Plain and compare links may be
 * followed by further filepaths and query params. Pull request commits links
 * cannot. Additionally, plain link paths have some that may not follow that
 * indicate reserved actions paths -- see method isReservedCommitActionPath. Thus,
 * https://github.com/desktop/desktop/commit/6fd7945/test/test/test will become
 * 6fd7945/test/test/test.
 *
 */
export class CommitMentionLinkFilter implements INodeFilter {
  /** A regexp that searches for the owner/name pattern in issue href */
  private readonly nameWithOwner =
    /(?<owner>-?[a-z0-9][a-z0-9\-\_]*)\/(?<name>(?:\w|\.|\-)+)/

  /**
   * A regexp that searches for a url path pattern for a commit
   *
   * Example: /desktop/desktop/commit/6fd7945
   */
  private readonly commitPath = /^commit\/(?<pathFragment>.+)$/

  /**
   * A regexp that searches for a url path pattern for a compare
   *
   * Example: /desktop/desktop/commit/6fd7945...6fd7945
   */
  private readonly comparePath = /^compare\/(?<range>.+)$/

  /**
   * A regexp that searches for a url path pattern for a compare
   *
   * Example: /desktop/desktop/commit/6fd7945...6fd7945
   */
  private readonly pullCommitPath =
    /^pull\/(\d+)\/commits\/(?<sha>[0-9a-f]{7,40})$/

  /** A regexp that matches a full issue, pull request, or discussion url
   * including the anchor */
  private get commitMentionUrl(): RegExp {
    const gitHubURL = getHTMLURL(this.repository.endpoint)
    return new RegExp(
      escapeRegExp(gitHubURL) +
        '/' +
        this.nameWithOwner.source +
        '/' +
        /(commit|pull|compare)/.source +
        '/' +
        /(\d+\/commits\/)?/.source +
        /([0-9a-f]{7,40})/.source +
        /\b/.source
    )
  }

  /** The parent github repository of which the content the filter is being
   * applied to belongs  */
  private readonly repository: GitHubRepository

  public constructor(repository: GitHubRepository) {
    this.repository = repository
  }

  /**
   * Commit mention link filter iterates on all anchor elements that are not
   * inside a pre, code, or anchor tag and resemble a commit mention link and
   * their href matches their inner text.
   *
   * Looking for something like:
   * <a href="https://github.com/desktop/desktop/commit/6fd7945">https://github.com/desktop/desktop/commit/6fd7945</a>
   * Where the href could be like:
   *  - Plain Single Commit: https://github.com/desktop/desktop/commit/6fd7945
   *  - Compare a range of Commits: https://github.com/desktop/desktop/compare/6fd7945...6fd7945
   *  - Pull Request Commit: https://github.com/desktop/desktop/pull/14239/commits/6fd7945
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (el: Element) => {
        return (el.parentNode !== null &&
          ['CODE', 'PRE', 'A'].includes(el.parentNode.nodeName)) ||
          !(el instanceof HTMLAnchorElement) ||
          el.href !== el.innerText ||
          !this.commitMentionUrl.test(el.href)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
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
    const newNode = node.cloneNode(true)
    const { textContent: text } = newNode
    if (!(newNode instanceof HTMLAnchorElement) || text === null) {
      return null
    }

    const url = new URL(text)
    const [, owner, name] = url.pathname.split('/', 3)
    if (owner === undefined || name === undefined) {
      return null
    }
    const slashes = 3
    const path = url.pathname.substring(owner.length + name.length + slashes)

    let ref, filepathToAppend

    const commitComparePathMatch =
      this.getRefFromCommitPath(path) ?? this.getRefFromComparePath(path)
    if (commitComparePathMatch !== null) {
      ;({ ref, filepathToAppend } = commitComparePathMatch)

      filepathToAppend =
        filepathToAppend !== undefined
          ? filepathToAppend + url.search
          : url.search
    } else {
      ref = this.getRefFromPullPath(path)
    }

    if (ref === null || ref === undefined) {
      return null
    }

    newNode.innerHTML = this.getCommitMentionRef(
      owner,
      name,
      ref,
      filepathToAppend
    )
    return [newNode]
  }

  private getRefFromCommitPath(path: string) {
    const match = path.match(this.commitPath)
    if (match === null || match.groups === undefined) {
      return null
    }

    const { pathFragment } = match.groups
    const slashIndex = pathFragment.indexOf('/')
    const possibleSha =
      slashIndex >= 0 ? pathFragment.slice(0, slashIndex) : pathFragment
    const filepathToAppend =
      slashIndex >= 0 ? pathFragment.slice(slashIndex) : undefined

    if (possibleSha === undefined) {
      return null
    }
    const [sha, format] = possibleSha.split('.')

    if (
      sha === undefined ||
      this.isReservedCommitActionPath(filepathToAppend) ||
      format !== undefined
    ) {
      return null
    }

    return {
      ref: this.trimCommitSha(sha),
      filepathToAppend,
    }
  }

  private getRefFromComparePath(path: string) {
    const match = path.match(this.comparePath)
    if (match === null || match.groups === undefined) {
      return null
    }

    const { range } = match.groups

    if (/\.(diff|path)$/.test(range)) {
      return null
    }

    const shas = range.split('...')
    if (shas.length > 2) {
      return null
    }

    const slashIndex = shas[1].indexOf('/')
    const secondSha = slashIndex >= 0 ? shas[1].slice(0, slashIndex) : shas[1]

    return {
      ref: `${this.trimCommitSha(shas[0])}...${this.trimCommitSha(secondSha)}`,
      filepathToAppend: slashIndex >= 0 ? shas[1].slice(slashIndex) : undefined,
    }
  }

  private getRefFromPullPath(path: string) {
    const match = path.match(this.pullCommitPath)
    if (match === null || match.groups === undefined) {
      return null
    }

    return this.trimCommitSha(match.groups.sha)
  }

  /**
   * Commit action path's are not formatted nor shortened.
   *
   * Commit links could be action paths
   * ${github.url}/owner/repo/commit/1234567/${actionPathPossibility}
   *
   * where actionPathPossibility could look like:
   * "_render_node/partialpath"
   * "checks"
   * "checks/123"
   * "checks/123/logs"
   * "checks_state_summary"
   * "hovercard"
   *  "rollup"
   * "show_partial"
   */
  private isReservedCommitActionPath(filePath: string | undefined) {
    const commitActions = [
      'checks_state_summary',
      'hovercard',
      'rollup',
      'show_partial',
    ]
    if (filePath === undefined) {
      return false
    }

    const commitActionsWithParams = ['_render_node', 'checks']
    return (
      commitActions.includes(filePath) ||
      commitActionsWithParams.includes(filePath.split('/')[0])
    )
  }

  /**
   * Creates commit sha references
   */
  private getCommitMentionRef(
    owner: string,
    name: string,
    shaRef: string,
    filePath?: string
  ) {
    const ownerRepo =
      owner !== this.repository.owner.login || name !== this.repository.name
        ? `${owner}/${name}@`
        : ''
    const trimmedSha = this.trimCommitSha(shaRef)
    return `${ownerRepo}<tt>${trimmedSha}</tt>${filePath ?? ''}`
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
