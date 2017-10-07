/* tslint:disable:no-sync-functions */

import * as path from 'path'
import * as fs from 'fs-extra'

const legalEagle: LegalEagle = require('legal-eagle')

import { getReleaseChannel, getDistRoot, getVersion } from './dist-info'

const projectRoot = path.join(__dirname, '..')
const outRoot = path.join(projectRoot, 'app', 'dist')

const isPublishableBuild = getReleaseChannel() !== 'development'

console.log(`Building for ${getReleaseChannel()}…`)

console.log('Removing old distribution…')
fs.removeSync(getDistRoot())

console.log('Packaging emoji…')
copyEmoji()

console.log('Copying static resources…')
copyStaticResources()

console.log('Updating our licenses dump…')
updateLicenseDump(err => {
  if (err) {
    console.error(
      'Error updating the license dump. This is fatal for a published build.'
    )
    console.error(err)

    if (isPublishableBuild) {
      process.exit(1)
      return
    }
  }
})

function removeAndCopy(source: string, destination: string) {
  fs.removeSync(destination)
  fs.copySync(source, destination)
}

function copyEmoji() {
  const emojiImages = path.join(projectRoot, 'gemoji', 'images', 'emoji')
  const emojiImagesDestination = path.join(outRoot, 'emoji')
  removeAndCopy(emojiImages, emojiImagesDestination)

  const emojiJSON = path.join(projectRoot, 'gemoji', 'db', 'emoji.json')
  const emojiJSONDestination = path.join(outRoot, 'emoji.json')
  removeAndCopy(emojiJSON, emojiJSONDestination)
}

function copyStaticResources() {
  const dirName = process.platform
  const platformSpecific = path.join(projectRoot, 'app', 'static', dirName)
  const common = path.join(projectRoot, 'app', 'static', 'common')
  const destination = path.join(outRoot, 'static')
  fs.removeSync(destination)
  if (fs.existsSync(platformSpecific)) {
    fs.copySync(platformSpecific, destination)
  }
  fs.copySync(common, destination, { clobber: false })
}

function updateLicenseDump(callback: (err: Error | null) => void) {
  const appRoot = path.join(projectRoot, 'app')
  const outPath = path.join(outRoot, 'static', 'licenses.json')
  const licenseOverrides: LicenseLookup = require('./license-overrides')

  legalEagle(
    { path: appRoot, overrides: licenseOverrides, omitPermissive: true },
    (err, summary) => {
      if (err) {
        callback(err)
        return
      }

      if (Object.keys(summary).length > 0) {
        const overridesPath = path.join(__dirname, 'license-overrides.js')
        let licensesMessage = ''
        for (const key in summary) {
          const license = summary[key]
          licensesMessage += `${key} (${license.repository}): ${license.license}\n`
        }

        const message = `The following dependencies have unknown or non-permissive licenses. Check it out and update ${overridesPath} if appropriate:\n${licensesMessage}`
        callback(new Error(message))
      } else {
        legalEagle(
          { path: appRoot, overrides: licenseOverrides },
          (err, summary) => {
            if (err) {
              callback(err)
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
            callback(null)
          }
        )
      }
    }
  )
}
