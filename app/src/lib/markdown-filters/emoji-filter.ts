import { INodeFilter } from './node-filter'
import { fileURLToPath } from 'url'
import { readFile } from 'fs/promises'
import escapeRegExp from 'lodash/escapeRegExp'
import { Emoji } from '../emoji'

/**
 * The Emoji Markdown filter will take a text node and create multiple text and
 * image nodes by inserting emoji images using base64 data uri where emoji
 * references are in the text node.
 *
 * Example: A text node of "That is great! :+1: Good Job!"
 * Becomes three nodes: "That is great! ",<img src="data uri for :+1:>, " Good Job!"
 *
 * Notes: We are taking the emoji file paths and creating the base 64 data URI
 * because this is to be injected into a sandboxed markdown parser were we will
 * no longer have access to the local file paths.
 */
export class EmojiFilter implements INodeFilter {
  private readonly emojiRegex: RegExp
  private readonly allEmoji: Map<string, Emoji>
  private readonly emojiBase64URICache: Map<string, string> = new Map()

  /**
   * @param emoji Map from the emoji ref (e.g., :+1:) to the image's local path.
   */
  public constructor(emoji: Map<string, Emoji>) {
    this.allEmoji = emoji
    this.emojiRegex = this.buildEmojiRegExp(emoji)
  }

  /**
   * Emoji filter iterates on all text nodes that are not inside a pre or code tag.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return node.parentNode !== null &&
          ['CODE', 'PRE'].includes(node.parentNode.nodeName)
          ? NodeFilter.FILTER_SKIP
          : NodeFilter.FILTER_ACCEPT
      },
    })
  }

  /**
   * Takes a text node and creates multiple text and image nodes by inserting
   * emoji image nodes using base64 data uri where emoji references are.
   *
   * Example: A text node of "That is great! :+1: Good Job!" Becomes three
   * nodes: ["That is great! ",<img src="data uri for :+1:>, " Good Job!"]
   *
   * Note: Emoji filter requires text nodes; otherwise we may inadvertently replace non text elements.
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    let text = node.textContent
    if (
      node.nodeType !== node.TEXT_NODE ||
      text === null ||
      !text.includes(':')
    ) {
      return null
    }

    const emojiMatches = text.match(this.emojiRegex)
    if (emojiMatches === null) {
      return null
    }

    const nodes = new Array<Text | HTMLImageElement>()
    for (let i = 0; i < emojiMatches.length; i++) {
      const emojiKey = emojiMatches[i]
      const emoji = this.allEmoji.get(emojiKey)
      if (emoji === undefined) {
        continue
      }

      const emojiNode = await this.createEmojiNode(emoji)
      if (emojiNode === null) {
        continue
      }

      const emojiPosition = text.indexOf(emojiKey)
      const textBeforeEmoji = text.slice(0, emojiPosition)
      const textNodeBeforeEmoji = document.createTextNode(textBeforeEmoji)
      nodes.push(textNodeBeforeEmoji)
      nodes.push(emojiNode)

      text = text.slice(emojiPosition + emojiKey.length)
    }

    if (text !== '') {
      const trailingTextNode = document.createTextNode(text)
      nodes.push(trailingTextNode)
    }

    return nodes
  }

  /**
   * Method to build an emoji node to insert in place of the emoji ref.
   * If we fail to create the emoji element, returns null.
   */
  private async createEmojiNode(
    emoji: Emoji
  ): Promise<HTMLImageElement | null> {
    try {
      const dataURI = await this.getBase64FromImageUrl(emoji.url)
      const emojiImg = new Image()
      emojiImg.classList.add('emoji')
      emojiImg.src = dataURI
      emojiImg.alt = emoji.description ?? ''
      return emojiImg
    } catch (e) {}
    return null
  }

  /**
   * Method to obtain an images base 64 data uri from it's file path.
   * - It checks cache, if not, reads from file, then stores in cache.
   */
  private async getBase64FromImageUrl(filePath: string): Promise<string> {
    const cached = this.emojiBase64URICache.get(filePath)
    if (cached !== undefined) {
      return cached
    }
    const imageBuffer = await readFile(fileURLToPath(filePath))
    const b64src = imageBuffer.toString('base64')
    const uri = `data:image/png;base64,${b64src}`
    this.emojiBase64URICache.set(filePath, uri)

    return uri
  }

  /**
   * Builds a regular expression that is looking for all group of characters
   * that represents any emoji ref (or map key) in the provided map.
   *
   * @param emoji Map from the emoji ref (e.g., :+1:) to the image's local path.
   */
  private buildEmojiRegExp(emoji: Map<string, Emoji>): RegExp {
    const emojiGroups = [...emoji.keys()]
      .map(emoji => escapeRegExp(emoji))
      .join('|')
    return new RegExp('(' + emojiGroups + ')', 'g')
  }
}
