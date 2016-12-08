import * as Path from 'path'
import * as Fs from 'fs'

interface IFrontMatterResult<T> {
  readonly attributes: T
  readonly body: string
}

const frontMatter: <T>(path: string) => IFrontMatterResult<T> = require('front-matter')

interface IChooseALicense {
  readonly title: string
  readonly nickname?: string
  readonly featured?: boolean
}

export interface ILicense {
  /** The human-readable name. */
  readonly name: string

  /** Is the license featured? */
  readonly featured: boolean

  /** The actual text of the license. */
  readonly body: string
}

const root = Path.join(__dirname, 'static', 'choosealicense.com', '_licenses')

let cachedLicenses: ReadonlyArray<ILicense> | null = null

function readFileAsync(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Fs.readFile(path, 'utf8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

/** Get the available licenses. */
export function getLicenses(): Promise<ReadonlyArray<ILicense>> {
  if (cachedLicenses) {
    return Promise.resolve(cachedLicenses)
  } else {
    return new Promise((resolve, reject) => {
      Fs.readdir(root, async (err, files) => {
        if (err) {
          reject(err)
        } else {
          const licenses = new Array<ILicense>()
          for (const file of files) {
            const fullPath = Path.join(root, file)
            const contents = await readFileAsync(fullPath)
            const result = frontMatter<IChooseALicense>(contents)
            const license: ILicense = {
              name: result.attributes.nickname || result.attributes.title,
              featured: result.attributes.featured || false,
              body: result.body,
            }

            licenses.push(license)
          }

          cachedLicenses = licenses

          resolve(cachedLicenses)
        }
      })
    })
  }
}
