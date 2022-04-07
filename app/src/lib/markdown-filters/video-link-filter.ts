import { INodeFilter } from './node-filter'
import { githubAssetVideoRegex } from './video-url-regex'

/**
 * The Video Link filter matches a github-flavored markdown target of a link,
 * like
 * <p><a href="https://user-images.githubusercontent.com/7559041/1234.mp4">…</a></p>.
 *
 * This type of pattern is formed when a user pastes the video url in markdown
 * editor and then the markdown parser auto links it.
 *
 * If the url is in the format of a github user asset, it will replace the
 * paragraph with link with a a video tag. If not, the link is left unmodified.
 */
export class VideoLinkFilter implements INodeFilter {
  /**
   * Video link matches on p tags with an a tag with a single child of a tag
   * with an href that's host matches a pattern of video url that is a github
   * user asset.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (el: Element) =>
        this.getGithubVideoLink(el) === null
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT,
    })
  }

  /**
   * Takes a paragraph element with a single anchor element that's href appears
   * to be be a video link and replaces it with a video tag.
   *
   * Example:
   * <p>
   *  <a href="https://user-images.githubusercontent.com/7559041/1234.mp4">
   *    https://user-images.githubusercontent.com/7559041/1234.mp4
   *  </a>
   * </p>
   *
   * Output = [
   * <video src="https://user-images.githubusercontent.com/7559041/1234.mp4"></video>
   * ]
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    const videoSrc = this.getGithubVideoLink(node)
    if (videoSrc === null) {
      return null
    }

    const videoNode = document.createElement('video')
    videoNode.src = videoSrc
    return [videoNode]
  }

  /**
   * If the give node is a video url post markdown parsing, it returns the video
   * url, else return null.
   *
   * Video url post markdown parsing looks like:
   * <p>
   *  <a href="https://user-images.githubusercontent.com/7559041/1234.mp4">
   *    https://user-images.githubusercontent.com/7559041/1234.mp4
   *  </a>
   * </p>
   * */
  private getGithubVideoLink(node: Node): string | null {
    if (
      node instanceof HTMLParagraphElement &&
      node.childElementCount === 1 &&
      node.firstChild instanceof HTMLAnchorElement &&
      githubAssetVideoRegex.test(node.firstChild.href)
    ) {
      return node.firstChild.href
    }

    return null
  }
}
