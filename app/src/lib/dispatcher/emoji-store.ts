import * as Fs from 'fs'
import * as Path from 'path'
import * as Url from 'url'

export default class EmojiStore {
  /** Map from shorcut (e.g., +1) to on disk URL. */
  public readonly emoji = new Map<string, string>()

  public read(): Promise<void> {
    return new Promise((resolve, reject) => {
      Fs.readFile(Path.join(__dirname, 'emoji.json'), 'utf8', (err, data) => {
        const json = JSON.parse(data)
        for (const key of Object.keys(json)) {
          const serverURL = json[key]
          const localPath = serverURLToLocalPath(serverURL)
          this.emoji.set(key, localPath)
        }

        resolve()
      })
    })
  }
}

function serverURLToLocalPath(url: string): string {
  // url = https://assets-cdn.github.com/images/icons/emoji/unicode/1f44e.png?v6

  const parsedURL = Url.parse(url)

  const path = parsedURL.pathname!
  // path = /images/icons/emoji/unicode/1f44e.png

  const relativePath = path.replace('/images/icons', '')
  // relativePath = /emoji/unicode/1f44e.png

  return `file://${Path.join(__dirname, relativePath)}`
}
