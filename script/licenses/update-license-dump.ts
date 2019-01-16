import * as path from 'path'
import * as fs from 'fs-extra'
import { promisify } from 'util'

import { licenseOverrides } from './license-overrides'

import * as _legalEagle from 'legal-eagle'
const legalEagle = promisify(_legalEagle)

import { getVersion } from '../../app/package-info'

export async function updateLicenseDump(
  projectRoot: string,
  outRoot: string
): Promise<void> {
  const appRoot = path.join(projectRoot, 'app')
  const outPath = path.join(outRoot, 'static', 'licenses.json')

  let summary = await legalEagle({
    path: appRoot,
    overrides: licenseOverrides,
    omitPermissive: true,
  })

  if (Object.keys(summary).length > 0) {
    let licensesMessage = ''
    for (const key in summary) {
      const license = summary[key]
      licensesMessage += `${key} (${license.repository}): ${license.license}\n`
    }

    const overridesPath = path.join(__dirname, 'license-overrides.ts')

    const message = `The following dependencies have unknown or non-permissive licenses. Check it out and update ${overridesPath} if appropriate:\n${licensesMessage}`
    throw new Error(message)
  }

  summary = await legalEagle({
    path: appRoot,
    overrides: licenseOverrides,
  })

  // legal-eagle still chooses to ignore the LICENSE at the root
  // this injects the current license and pins the source URL before we
  // dump the JSON file to disk
  const licenseSource = path.join(projectRoot, 'LICENSE')
  const licenseText = await fs.readFile(licenseSource, {
    encoding: 'utf-8',
  })
  const appVersion = getVersion()

  summary[`desktop@${appVersion}`] = {
    repository: 'https://github.com/desktop/desktop',
    license: 'MIT',
    source: `https://github.com/desktop/desktop/blob/release-${appVersion}/LICENSE`,
    sourceText: licenseText,
  }

  await fs.writeFile(outPath, JSON.stringify(summary), {
    encoding: 'utf8',
  })
}
