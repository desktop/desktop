import * as path from 'path'
import * as fs from 'fs-extra'

import { licenseOverrides } from './license-overrides'

import * as legalEagle from 'legal-eagle'
import { getVersion } from '../../app/package-info'

export function updateLicenseDump(
  projectRoot: string,
  outRoot: string
): Promise<void> {
  const appRoot = path.join(projectRoot, 'app')
  const outPath = path.join(outRoot, 'static', 'licenses.json')

  return new Promise((resolve, reject) => {
    legalEagle(
      { path: appRoot, overrides: licenseOverrides, omitPermissive: true },
      (err, summary) => {
        if (err) {
          reject(err)
          return
        }

        if (Object.keys(summary).length > 0) {
          let licensesMessage = ''
          for (const key in summary) {
            const license = summary[key]
            licensesMessage += `${key} (${license.repository}): ${
              license.license
            }\n`
          }

          const overridesPath = path.join(__dirname, 'license-overrides.ts')

          const message = `The following dependencies have unknown or non-permissive licenses. Check it out and update ${overridesPath} if appropriate:\n${licensesMessage}`
          reject(new Error(message))
        } else {
          legalEagle(
            { path: appRoot, overrides: licenseOverrides },
            (err, summary) => {
              if (err) {
                reject(err)
                return
              }

              // legal-eagle still chooses to ignore the LICENSE at the root
              // this injects the current license and pins the source URL before we
              // dump the JSON file to disk
              const licenseSource = path.join(projectRoot, 'LICENSE')
              const licenseText = fs.readFileSync(licenseSource, {
                encoding: 'utf-8',
              })
              const appVersion = getVersion()

              summary[`desktop@${appVersion}`] = {
                repository: 'https://github.com/desktop/desktop',
                license: 'MIT',
                source: `https://github.com/desktop/desktop/blob/release-${appVersion}/LICENSE`,
                sourceText: licenseText,
              }

              fs.writeFileSync(outPath, JSON.stringify(summary), {
                encoding: 'utf8',
              })
              resolve()
            }
          )
        }
      }
    )
  })
}
