import { fatalError } from '../fatal-error'
import { INodeFilter } from './node-filter'

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
  private readonly emoji: Map<string, string>

  /**
   * @param emoji Map from the emoji ref (e.g., :+1:) to the image's local path.
   */
  public constructor(emoji: Map<string, string>) {
    this.emoji = emoji
    this.emojiRegex = this.buildEmojiRegExp(emoji)
  }

  /**
   * Emoji filter iterates on all text nodes.
   */
  public createFilterTreeWalker(doc: Document): TreeWalker {
    return document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, null)
  }

  /**
   * Takes a text node and creates multiple text and image nodes by inserting
   * emoji image nodes using base64 data uri where emoji references are.
   *
   * Example: A text node of "That is great! :+1: Good Job!" Becomes three
   * nodes: ["That is great! ",<img src="data uri for :+1:>, " Good Job!"]
   */
  public async filter(node: Node): Promise<ReadonlyArray<Node> | null> {
    if (!(node instanceof Text)) {
      fatalError(
        'Emoji filter requires text nodes; otherwise we may inadvertently replace non text elements.'
      )
    }

    if (node.textContent === null || !node.textContent.includes(':')) {
      return null
    }

    let text = node.textContent
    const emojiMatches = text.match(this.emojiRegex)
    if (emojiMatches === null) {
      return null
    }

    const nodes: Array<Text | HTMLImageElement> = []
    for (let i = 0; i < emojiMatches.length; i++) {
      const emojiKey = emojiMatches[i]
      const emojiPath = this.emoji.get(emojiKey)
      if (emojiPath === undefined) {
        continue
      }

      const emojiPosition = text.indexOf(emojiMatches[0])
      const textBeforeEmoji = text.slice(0, emojiPosition)
      const textNodeBeforeEmoji = document.createTextNode(textBeforeEmoji)
      nodes.push(textNodeBeforeEmoji)

      const emojiImg = await this.createEmojiNode(emojiPath)
      nodes.push(emojiImg)

      text = text.slice(emojiPosition + emojiKey.length)
    }

    if (text !== '') {
      const trailingTextNode = document.createTextNode(text)
      nodes.push(trailingTextNode)
    }

    return nodes
  }

  /**
   * Method to build an emoji image node to insert in place of the emoji ref
   */
  private async createEmojiNode(emojiPath: string) {
    const dataURI = await getBase64FromImageUrl(emojiPath)
    const emojiImg = new Image()
    emojiImg.classList.add('emoji')
    emojiImg.src = dataURI
    return emojiImg
  }

  /**
   * Builds a regular expression that is looking for all group of characters
   * that represents any emoji ref (or map key) in the provided map.
   *
   * @param emoji Map from the emoji ref (e.g., :+1:) to the image's local path.
   */
  private buildEmojiRegExp(emoji: Map<string, string>): RegExp {
    const emojiGroups = [...emoji.keys()]
      .map(emoji => escapeRegExp(emoji))
      .join('|')
      .slice(0, -1)
    return new RegExp('(' + emojiGroups + ')', 'g')
  }
}

/**
 * Method to obtain an images base 64 data uri from it's file path.
 */
function getBase64FromImageUrl(url: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.src = url

    img.onload = function (e) {
      const image = e.currentTarget
      if (!(image instanceof Image)) {
        resolve('')
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height

      const ctx = canvas.getContext('2d')

      if (ctx === null) {
        resolve('')
        return
      }
      ctx.drawImage(image, 0, 0)

      resolve(canvas.toDataURL())
    }
  })
}

/**
 * Add backslash in front of regular expression special characters
 *
 * See Escaping in https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
 */
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}
