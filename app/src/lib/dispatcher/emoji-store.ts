import * as Fs from 'fs'
import * as Path from 'path'

/** Type representing the contents of the gemoji json database */
type IGemojiDb = [ IGemojiDefinition ]

/**
 * Partial (there's more in the db) interface describing the elements
 * in the gemoji json array.
 */
interface IGemojiDefinition {
  /**
   * The unicode string of the emoji if emoji is part of
   * the unicode specification. If missing this emoji is
   * a GitHub custom emoji such as :shipit:  */
  emoji?: string

  /** One or more human readable aliases for the emoji character */
  aliases: [ string ]

  /** An optional, human readable, description of the emoji  */
  description?: string
}

export default class EmojiStore {
  /** Map from shorcut (e.g., :+1:) to on disk URL. */
  public readonly emoji = new Map<string, string>()

  private getEmojiImageUrlFromRelativePath(relativePath: string) {
    return `file://${Path.join(__dirname, 'emoji', relativePath)}`
  }

  private getHexCodePoint(cp: number) {
    const str = cp.toString(16)
    return str.length >= 4
      ? str
      : ('0000' + str).substring(str.length)
  }

  private getUrlFromUnicodeEmoji(emoji: string) {

    const codePoint = emoji.codePointAt(0)

    if (!codePoint) {
      return null
    }

    let filename = this.getHexCodePoint(codePoint)

    if (emoji.length > 2) {
      const combiningCodePoint = emoji.codePointAt(2)

      if (combiningCodePoint && combiningCodePoint !== 0xfe0f) {
        filename = `${filename}-${this.getHexCodePoint(combiningCodePoint)}`
      }
    }

    return this.getEmojiImageUrlFromRelativePath(`unicode/${filename}.png`)
  }

  public read(): Promise<void> {
    return new Promise((resolve, reject) => {
      const basePath = process.env.TEST_ENV ? Path.join(__dirname, '..', '..', '..', 'static') : __dirname
      Fs.readFile(Path.join(basePath, 'emoji.json'), 'utf8', (err, data) => {
        const db: IGemojiDb = JSON.parse(data)
        db.forEach(emoji => {

          const url = emoji.emoji
            ? this.getUrlFromUnicodeEmoji(emoji.emoji)
            : this.getEmojiImageUrlFromRelativePath(`${emoji.aliases[0]}.png`)

          if (!url) {
            console.error('Emoji crisis')
            return
          }

          emoji.aliases.forEach(alias => {
            this.emoji.set(`:${alias}:`, url)
          })
        })

        resolve()
      })
    })
  }
}
