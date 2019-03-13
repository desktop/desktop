import * as Path from 'path'
import { writeFile, readFile } from 'fs-extra'

export interface ILicense {
  /** The human-readable name. */
  readonly name: string
  /** Is the license featured? */
  readonly featured: boolean
  /** The actual text of the license. */
  readonly body: string
  /** Whether to hide the license from the standard list */
  readonly hidden: boolean
}

interface ILicenseFields {
  readonly fullname: string
  readonly email: string
  readonly project: string
  readonly description: string
  readonly year: string
}

let cachedLicenses: ReadonlyArray<ILicense> | null = null

/** Get the available licenses. */
export async function getLicenses(): Promise<ReadonlyArray<ILicense>> {
  if (cachedLicenses != null) {
    return cachedLicenses
  } else {
    const licensesMetadataPath = Path.join(
      __dirname,
      'static',
      'available-licenses.json'
    )
    const json = await readFile(licensesMetadataPath, 'utf8')
    const licenses: Array<ILicense> = JSON.parse(json)

    cachedLicenses = licenses.sort((a, b) => {
      if (a.featured) {
        return -1
      }
      if (b.featured) {
        return 1
      }
      return a.name.localeCompare(b.name)
    })

    return cachedLicenses
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

function replaceTokens(
  body: string,
  tokens: ReadonlyArray<keyof ILicenseFields>,
  fields: ILicenseFields
): string {
  let newBody = body
  for (const token of tokens) {
    const value = fields[token]
    newBody = replaceToken(newBody, token, value)
  }

  return newBody
}

function ensureLineEndingSet(body: string) {
  return body.endsWith('\n') ? body : `${body}\n`
}

/** Write the license to the the repository at the given path. */
export async function writeLicense(
  repositoryPath: string,
  license: ILicense,
  fields: ILicenseFields
): Promise<void> {
  const fullPath = Path.join(repositoryPath, 'LICENSE')

  const tokens: ReadonlyArray<keyof ILicenseFields> = [
    'fullname',
    'email',
    'project',
    'description',
    'year',
  ]

  const body = replaceTokens(license.body, tokens, fields)
  await writeFile(fullPath, ensureLineEndingSet(body))
}
