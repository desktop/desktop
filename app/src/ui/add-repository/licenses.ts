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

interface ILicenseFields {
  readonly fullname: string
  readonly email: string
  readonly project: string
  readonly description: string
  readonly year: string
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
              body: result.body.trim(),
            }

            licenses.push(license)
          }

          cachedLicenses = licenses.sort((a, b) => {
            if (a.featured) { return -1 }
            if (b.featured) { return 1 }
            return a.name.localeCompare(b.name)
          })

          resolve(cachedLicenses)
        }
      })
    })
  }
}

function replaceToken(body: string, token: string, value: string): string {
  // The license templates are inconsitent :( Sometimes they use [token] and
  // sometimes {token}. So we'll standardize first to {token} and then do
  // replacements.
  const oldPattern = new RegExp(`\\[${token}\\]`, 'g')
  const newBody = body.replace(oldPattern, `{${token}}`)

  const newPattern = new RegExp(`\\{${token}\\}`, 'g')
  return newBody.replace(newPattern, value)
}

function replaceTokens(body: string, tokens: ReadonlyArray<keyof ILicenseFields>, fields: ILicenseFields): string {
  let newBody = body
  for (const token of tokens) {
    const value = fields[token]
    newBody = replaceToken(newBody, token, value)
  }

  return newBody
}

/** Write the license to the the repository at the given path. */
export function writeLicense(repositoryPath: string, license: ILicense, fields: ILicenseFields): Promise<void> {
  const fullPath = Path.join(repositoryPath, 'LICENSE')

  return new Promise<void>((resolve, reject) => {
    const tokens: ReadonlyArray<keyof ILicenseFields> = [ 'fullname', 'email', 'project', 'description', 'year' ]
    const body = replaceTokens(license.body, tokens, fields)

    Fs.writeFile(fullPath, body, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
