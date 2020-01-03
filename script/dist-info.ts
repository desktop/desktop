import * as Path from 'path'
import * as Fs from 'fs'

import { getProductName, getVersion } from '../app/package-info'
import { getReleaseBranchName } from './build-platforms'

const productName = getProductName()
const version = getVersion()

const projectRoot = Path.join(__dirname, '..')

const publishChannels = ['production', 'test', 'beta']

export function getDistRoot() {
  return Path.join(projectRoot, 'dist')
}

export function getDistPath() {
  return Path.join(
    getDistRoot(),
    `${getExecutableName()}-${process.platform}-x64`
  )
}

export function getExecutableName() {
  const suffix = process.env.NODE_ENV === 'development' ? '-dev' : ''

  if (process.platform === 'win32') {
    return `${getWindowsIdentifierName()}${suffix}`
  } else if (process.platform === 'linux') {
    return 'desktop'
  } else {
    return productName
  }
}

export function getOSXZipName() {
  return `${productName}.zip`
}

export function getOSXZipPath() {
  return Path.join(getDistPath(), '..', getOSXZipName())
}

export function getWindowsInstallerName() {
  const productName = getExecutableName()
  return `${productName}Setup.msi`
}

export function getWindowsInstallerPath() {
  return Path.join(getDistPath(), '..', 'installer', getWindowsInstallerName())
}

export function getWindowsStandaloneName() {
  const productName = getExecutableName()
  return `${productName}Setup.exe`
}

export function getWindowsStandalonePath() {
  return Path.join(getDistPath(), '..', 'installer', getWindowsStandaloneName())
}

export function getWindowsFullNugetPackageName() {
  return `${getWindowsIdentifierName()}-${version}-full.nupkg`
}

export function getWindowsFullNugetPackagePath() {
  return Path.join(
    getDistPath(),
    '..',
    'installer',
    getWindowsFullNugetPackageName()
  )
}

export function getWindowsDeltaNugetPackageName() {
  return `${getWindowsIdentifierName()}-${version}-delta.nupkg`
}

export function getWindowsDeltaNugetPackagePath() {
  return Path.join(
    getDistPath(),
    '..',
    'installer',
    getWindowsDeltaNugetPackageName()
  )
}

export function getWindowsIdentifierName() {
  return 'GitHubDesktop'
}

export function getBundleSizes() {
  // eslint-disable-next-line no-sync
  const rendererStats = Fs.statSync(
    Path.join(projectRoot, 'out', 'renderer.js')
  )
  // eslint-disable-next-line no-sync
  const mainStats = Fs.statSync(Path.join(projectRoot, 'out', 'main.js'))
  return { rendererSize: rendererStats.size, mainSize: mainStats.size }
}

export function isPublishable(): boolean {
  const channelFromBranch = getChannelFromBranch()
  return channelFromBranch !== undefined
    ? publishChannels.includes(channelFromBranch)
    : false
}

export function getChannel() {
  const channelFromBranch = getChannelFromBranch()
  return channelFromBranch !== undefined
    ? channelFromBranch
    : process.env.NODE_ENV || 'development'
}

function getChannelFromBranch(): string | undefined {
  // Branch name format: __release-CHANNEL-DEPLOY_ID
  const pieces = getReleaseBranchName().split('-')
  if (pieces.length < 3 || pieces[0] !== '__release') {
    return
  }
  return pieces[1]
}

export function getReleaseSHA() {
  // Branch name format: __release-CHANNEL-DEPLOY_ID
  const pieces = getReleaseBranchName().split('-')
  if (pieces.length < 3 || pieces[0] !== '__release') {
    return null
  }

  return pieces[2]
}

export function getUpdatesURL() {
  return `https://central.github.com/api/deployments/desktop/desktop/latest?version=${version}&env=${getChannel()}`
}

export function shouldMakeDelta() {
  // Only production and beta channels include deltas. Test releases aren't
  // necessarily sequential so deltas wouldn't make sense.
  const channelsWithDeltas = ['production', 'beta']
  return channelsWithDeltas.indexOf(getChannel()) > -1
}

export function getIconFileName(): string {
  const baseName = 'icon-logo'
  return getChannel() === 'development' ? `${baseName}-yellow` : baseName
}
