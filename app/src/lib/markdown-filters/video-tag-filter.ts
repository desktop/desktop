import { INodeFilter } from './node-filter'
import { githubAssetVideoRegex } from './video-url-regex'

/**
 * The Video Link filter matches embedded video tags, like
 *
 * <video src="https://user-images.githubusercontent.com/7559041/1234.mp4"></video>
 *
 * If the url for the src does NOT match the pattern of a github user asset, we
 * remove the video tag.
 */
export class VideoTagFilter implements INodeFilter {
  /**
   * Video link filter matches on video tags that src does not match a github user asset url.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el: Element) {
        return !(el instanceof HTMLVideoElement) ||
          githubAssetVideoRegex.test(el.src)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  /**
   * Takes a video element who's src host is not a github user asset url and removes it.
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    if (
      !(node instanceof HTMLVideoElement) ||
      githubAssetVideoRegex.test(node.src)
    ) {
      // If it is video element with a valid source, we return null to leave it alone.
      // This is different than dotcom which regenerates a video tag because it
      // verifies through a db call that the assets exists
      return null
    }

    // Return empty array so that video tag is removed
    return []
  }
}
