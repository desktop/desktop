/* eslint-disable no-sync */
/// <reference path="./globals.d.ts" />

import * as cp from 'child_process'
import packager, { OfficialArch, OsxNotarizeOptions } from 'electron-packager'
import frontMatter from 'front-matter'
import * as os from 'os'
import * as path from 'path'
import { getPrintenvzPath } from 'printenvz'
import { getProxyCommandPath } from 'process-proxy'
import { externals } from '../app/webpack.common'

interface IChooseALicense {
  readonly title: string
  readonly nickname?: string
  readonly featured?: boolean
  readonly hidden?: boolean
}

export interface ILicense {
  readonly name: string
  readonly featured: boolean
  readonly body: string
  readonly hidden: boolean
}

import {
  getBundleID,
  getCompanyName,
  getProductName,
} from '../app/package-info'

import { isGitHubActions } from './build-platforms'
import {
  getChannel,
  getDistArchitecture,
  getDistRoot,
  getExecutableName,
  getIconDirectory,
  isPublishable,
} from './dist-info'

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { updateLicenseDump } from './licenses/update-license-dump'
import { verifyInjectedSassVariables } from './validate-sass/validate-all'
import { join } from 'path'
import assert from 'assert'

const isPublishableBuild = isPublishable()
const isNonProductionRelease = getChannel() !== 'production'
const isDevelopmentBuild = getChannel() === 'development'
const shouldSkipPackaging = process.env.DESKTOP_SKIP_PACKAGE === '1'

const projectRoot = path.join(__dirname, '..')
const entitlementsSuffix = isDevelopmentBuild ? '-dev' : ''
const entitlementsPath = `${projectRoot}/script/entitlements${entitlementsSuffix}.plist`
const extendInfoPath = `${projectRoot}/script/info.plist`
const outRoot = path.join(projectRoot, 'out')

console.log(`Building for ${getChannel()}…`)

console.log('Removing old distribution…')
rmSync(getDistRoot(), { recursive: true, force: true })

console.log('Copying dependencies…')
copyDependencies()

console.log('Packaging emoji…')
copyEmoji()

console.log('Copying static resources…')
copyStaticResources()

console.log('Parsing license metadata…')
generateLicenseMetadata(outRoot)

moveAnalysisFiles()

if (isGitHubActions() && process.platform === 'darwin' && isPublishableBuild) {
  console.log('Setting up keychain…')
  cp.execSync(path.join(__dirname, 'setup-macos-keychain'))
}

verifyInjectedSassVariables(outRoot)
  .catch(err => {
    console.error(
      'Error verifying the Sass variables in the rendered app. This is fatal for a published build.'
    )

    if (!isDevelopmentBuild) {
      process.exit(1)
    }
  })
  .then(() => {
    console.log('Updating our licenses dump…')
    return updateLicenseDump(projectRoot, outRoot).catch(err => {
      console.error(
        'Error updating the license dump. This is fatal for a published build.'
      )
      console.error(err)

      if (!isDevelopmentBuild) {
        process.exit(1)
      }
    })
  })
  .then(() => {
    if (shouldSkipPackaging) {
      console.log('Skipping packaging…')
      return [outRoot]
    }

    console.log('Packaging…')
    return packageApp()
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .then(appPaths => {
    console.log(`Built to ${appPaths}`)
  })

function packageApp() {
  // not sure if this is needed anywhere, so I'm just going to inline it here
  // for now and see what the future brings...
  const toPackagePlatform = (platform: NodeJS.Platform) => {
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
      return platform
    }
    throw new Error(
      `Unable to convert to platform for electron-packager: '${process.platform}`
    )
  }

  const toPackageArch = (targetArch: string | undefined): OfficialArch => {
    if (targetArch === undefined) {
      targetArch = os.arch()
    }

    if (targetArch === 'arm64' || targetArch === 'x64') {
      return targetArch
    }

    throw new Error(
      `Building Desktop for architecture '${targetArch}' is not supported`
    )
  }

  // get notarization deets, unless we're not going to publish this
  const osxNotarize = isPublishableBuild ? getNotarizationOptions() : undefined

  if (
    isPublishableBuild &&
    isGitHubActions() &&
    process.platform === 'darwin' &&
    osxNotarize === undefined
  ) {
    // we can't publish a mac build without these
    throw new Error(
      'Unable to retreive appleId and/or appleIdPassword to notarize macOS build'
    )
  }

  const iconPath = getIconDirectory()
  const assetsCarPath = join(iconPath, 'Assets.car')
  assert(
    existsSync(assetsCarPath),
    `Unable to find Assets.car at ${assetsCarPath}`
  )

  return packager({
    name: getExecutableName(),
    platform: toPackagePlatform(process.platform),
    arch: toPackageArch(process.env.TARGET_ARCH),
    asar: false, // TODO: Probably wanna enable this down the road.
    out: getDistRoot(),
    icon: join(iconPath, 'icon-logo'),
    extraResource: [assetsCarPath],
    dir: outRoot,
    overwrite: true,
    tmpdir: false,
    derefSymlinks: false,
    prune: false, // We'll prune them ourselves below.
    ignore: [
      new RegExp('/node_modules/electron($|/)'),
      new RegExp('/node_modules/electron-packager($|/)'),
      new RegExp('/\\.git($|/)'),
      new RegExp('/node_modules/\\.bin($|/)'),
    ],
    appCopyright: `Copyright © ${new Date().getFullYear()} GitHub, Inc.`,

    // macOS
    appBundleId: getBundleID(),
    appCategoryType: 'public.app-category.developer-tools',
    darwinDarkModeSupport: true,
    osxSign: {
      optionsForFile: (path: string) => ({
        hardenedRuntime: true,
        entitlements: entitlementsPath,
      }),
      type: isPublishableBuild ? 'distribution' : 'development',
      // For development, we will use '-' as the identifier so that codesign
      // will sign the app to run locally. We need to disable 'identity-validation'
      // or otherwise it will replace '-' with one of the regular codesigning
      // identities in our system.
      identity: isDevelopmentBuild ? '-' : undefined,
      identityValidation: !isDevelopmentBuild,
    },
    osxNotarize,
    protocols: [
      {
        name: getBundleID(),
        schemes: [
          !isDevelopmentBuild
            ? 'x-github-desktop-auth'
            : 'x-github-desktop-dev-auth',
          'x-github-client',
          'github-mac',
        ],
      },
    ],
    extendInfo: extendInfoPath,

    // Windows
    win32metadata: {
      CompanyName: getCompanyName(),
      FileDescription: '',
      OriginalFilename: '',
      ProductName: getProductName(),
      InternalName: getProductName(),
    },
  })
}

function removeAndCopy(source: string, destination: string) {
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true })
}

function copyEmoji() {
  const emojiImages = path.join(projectRoot, 'gemoji', 'images', 'emoji')
  const emojiImagesDestination = path.join(outRoot, 'emoji')
  removeAndCopy(emojiImages, emojiImagesDestination)

  // Remove unicode-based emoji images (use the unicode emojis instead)
  const emojiImagesUnicode = path.join(emojiImagesDestination, 'unicode')
  rmSync(emojiImagesUnicode, { recursive: true, force: true })

  const emojiJSON = path.join(projectRoot, 'gemoji', 'db', 'emoji.json')
  const emojiJSONDestination = path.join(outRoot, 'emoji.json')
  removeAndCopy(emojiJSON, emojiJSONDestination)
}

function copyStaticResources() {
  const dirName = process.platform
  const platformSpecific = path.join(projectRoot, 'app', 'static', dirName)
  const common = path.join(projectRoot, 'app', 'static', 'common')
  const destination = path.join(outRoot, 'static')
  rmSync(destination, { recursive: true, force: true })
  if (existsSync(platformSpecific)) {
    cpSync(platformSpecific, destination, {
      recursive: true,
      verbatimSymlinks: true,
    })
  }
  cpSync(common, destination, {
    recursive: true,
    force: false,
    verbatimSymlinks: true,
  })
}

function moveAnalysisFiles() {
  const rendererReport = 'renderer.report.html'
  const analysisSource = path.join(outRoot, rendererReport)
  if (existsSync(analysisSource)) {
    const distRoot = getDistRoot()
    const destination = path.join(distRoot, rendererReport)
    mkdirSync(distRoot, { recursive: true })
    // there's no moveSync API here, so let's do it the old fashioned way
    //
    // unlinkSync below ensures that the analysis file isn't bundled into
    // the app by accident
    cpSync(analysisSource, destination, {
      recursive: true,
      force: true,
      verbatimSymlinks: true,
    })
    unlinkSync(analysisSource)
  }
}

function copyDependencies() {
  const pkg: Package = require(path.join(projectRoot, 'app', 'package.json'))

  const filterExternals = (dependencies: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(dependencies).filter(([k]) => externals.includes(k))
    )

  // The product name changes depending on whether it's a prod build or dev
  // build, so that we can have them running side by side.
  pkg.productName = getProductName()
  pkg.dependencies = filterExternals(pkg.dependencies)
  pkg.devDependencies =
    isDevelopmentBuild && pkg.devDependencies
      ? filterExternals(pkg.devDependencies)
      : {}

  writeFileSync(path.join(outRoot, 'package.json'), JSON.stringify(pkg))
  rmSync(path.resolve(outRoot, 'node_modules'), {
    recursive: true,
    force: true,
  })

  console.log('  Installing dependencies via yarn…')
  cp.execSync('yarn install', { cwd: outRoot, env: process.env })

  console.log('  Copying desktop-askpass-trampoline…')
  const trampolineSource = path.resolve(
    projectRoot,
    'app/node_modules/desktop-trampoline/build/Release'
  )
  const desktopTrampolineDir = path.resolve(outRoot, 'desktop-trampoline')
  const desktopAskpassTrampolineFile =
    process.platform === 'win32'
      ? 'desktop-askpass-trampoline.exe'
      : 'desktop-askpass-trampoline'

  rmSync(desktopTrampolineDir, { recursive: true, force: true })
  mkdirSync(desktopTrampolineDir, { recursive: true })
  cpSync(
    path.resolve(trampolineSource, desktopAskpassTrampolineFile),
    path.resolve(desktopTrampolineDir, desktopAskpassTrampolineFile),
    { recursive: true, verbatimSymlinks: true }
  )

  if (isNonProductionRelease) {
    console.log('  Copying copilot…')
    const copilotPkgDir = path.resolve(
      projectRoot,
      `app/node_modules/@github/copilot`
    )

    const copilotDestination = path.resolve(outRoot, 'copilot')
    cpSync(copilotPkgDir, copilotDestination, {
      recursive: true,
    })

    const nonValidPlatforms = ['darwin', 'linux', 'win32'].filter(
      p => p !== process.platform
    )
    const nonValidArchitectures = ['x64', 'arm64'].filter(
      a => a !== getDistArchitecture()
    )

    // Removing unnecessary prebuild binaries from the copilot package to reduce
    // bundle size
    const prebuildsDirs = [
      path.join(copilotDestination, 'prebuilds'),
      path.join(copilotDestination, 'ripgrep', 'bin'),
      path.join(copilotDestination, 'clipboard', 'node_modules', '@teddyzhu'),
    ]

    for (const prebuildsDir of prebuildsDirs) {
      const prebuilds = readdirSync(prebuildsDir)
      for (const prebuild of prebuilds) {
        for (const platform of nonValidPlatforms) {
          if (prebuild.includes(platform)) {
            rmSync(path.join(prebuildsDir, prebuild), {
              recursive: true,
              force: true,
            })
          }
        }

        for (const arch of nonValidArchitectures) {
          if (prebuild.includes(arch)) {
            rmSync(path.join(prebuildsDir, prebuild), {
              recursive: true,
              force: true,
            })
          }
        }
      }
    }
  }

  // Dev builds for macOS require a SSH wrapper to use SSH_ASKPASS
  if (process.platform === 'darwin' && isDevelopmentBuild) {
    console.log('  Copying ssh-wrapper')
    const sshWrapperFile = 'ssh-wrapper'
    cpSync(
      path.resolve(
        projectRoot,
        'app/node_modules/desktop-trampoline/build/Release',
        sshWrapperFile
      ),
      path.resolve(desktopTrampolineDir, sshWrapperFile),
      { recursive: true, verbatimSymlinks: true }
    )
  }

  console.log('  Copying git environment…')
  const gitDir = path.resolve(outRoot, 'git')
  rmSync(gitDir, { recursive: true, force: true })
  mkdirSync(gitDir, { recursive: true })
  cpSync(path.resolve(projectRoot, 'app/node_modules/dugite/git'), gitDir, {
    recursive: true,
    verbatimSymlinks: true,
  })

  console.log('  Copying desktop credential helper…')
  const mingw = getDistArchitecture() === 'x64' ? 'mingw64' : 'clangarm64'
  const gitCoreDir =
    process.platform === 'win32'
      ? path.resolve(outRoot, 'git', mingw, 'libexec', 'git-core')
      : path.resolve(outRoot, 'git', 'libexec', 'git-core')

  const desktopCredentialHelperTrampolineFile =
    process.platform === 'win32'
      ? 'desktop-credential-helper-trampoline.exe'
      : 'desktop-credential-helper-trampoline'

  const desktopCredentialHelperFile = `git-credential-desktop${
    process.platform === 'win32' ? '.exe' : ''
  }`

  cpSync(
    path.resolve(trampolineSource, desktopCredentialHelperTrampolineFile),
    path.resolve(gitCoreDir, desktopCredentialHelperFile),
    { recursive: true, verbatimSymlinks: true }
  )

  if (process.platform === 'darwin') {
    console.log('  Copying app-path binary…')
    const appPathMain = path.resolve(outRoot, 'main')
    rmSync(appPathMain, { recursive: true, force: true })
    cpSync(
      path.resolve(projectRoot, 'app/node_modules/app-path/main'),
      appPathMain,
      { recursive: true, verbatimSymlinks: true }
    )
  }

  console.log('  Copying process-proxy binary')
  cpSync(
    getProxyCommandPath(),
    path.resolve(
      outRoot,
      process.platform === 'win32' ? 'process-proxy.exe' : 'process-proxy'
    ),
    { recursive: true, verbatimSymlinks: true }
  )

  console.log('  Copying printenvz binary')
  cpSync(
    getPrintenvzPath(),
    path.resolve(
      outRoot,
      process.platform === 'win32' ? 'printenvz.exe' : 'printenvz'
    ),
    { recursive: true, verbatimSymlinks: true }
  )
}

function generateLicenseMetadata(outRoot: string) {
  const chooseALicense = path.join(outRoot, 'static', 'choosealicense.com')
  const licensesDir = path.join(chooseALicense, '_licenses')

  const files = readdirSync(licensesDir)

  const licenses = new Array<ILicense>()
  for (const file of files) {
    const fullPath = path.join(licensesDir, file)
    const contents = readFileSync(fullPath, 'utf8')
    const result = frontMatter<IChooseALicense>(contents)

    const licenseText = result.body.trim()
    // ensure that any license file created in the app does not trigger the
    // "no newline at end of file" warning when viewing diffs
    const licenseTextWithNewLine = `${licenseText}\n`

    const license: ILicense = {
      name: result.attributes.nickname || result.attributes.title,
      featured: result.attributes.featured || false,
      hidden:
        result.attributes.hidden === undefined || result.attributes.hidden,
      body: licenseTextWithNewLine,
    }

    if (!license.hidden) {
      licenses.push(license)
    }
  }

  const licensePayload = path.join(outRoot, 'static', 'available-licenses.json')
  const text = JSON.stringify(licenses)
  writeFileSync(licensePayload, text, 'utf8')

  // embed the license alongside the generated license payload
  const chooseALicenseLicense = path.join(chooseALicense, 'LICENSE.md')
  const licenseDestination = path.join(
    outRoot,
    'static',
    'LICENSE.choosealicense.md'
  )

  const licenseText = readFileSync(chooseALicenseLicense, 'utf8')
  const licenseWithHeader = `GitHub Desktop uses licensing information provided by choosealicense.com.

The bundle in available-licenses.json has been generated from a source list provided at https://github.com/github/choosealicense.com, which is made available under the below license:

------------

${licenseText}`

  writeFileSync(licenseDestination, licenseWithHeader, 'utf8')

  // sweep up the choosealicense directory as the important bits have been bundled in the app
  rmSync(chooseALicense, { recursive: true, force: true })
}

function getNotarizationOptions(): OsxNotarizeOptions | undefined {
  const {
    APPLE_ID: appleId,
    APPLE_ID_PASSWORD: appleIdPassword,
    APPLE_TEAM_ID: teamId,
  } = process.env

  return appleId && appleIdPassword && teamId
    ? { tool: 'notarytool', appleId, appleIdPassword, teamId }
    : undefined
}
