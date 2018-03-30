'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')

const packageInfo = require('../app/package-info')
const productName = packageInfo.getProductName()
const version = packageInfo.getVersion()

const projectRoot = path.join(__dirname, '..')

function getDistRoot() {
  return path.join(projectRoot, 'dist')
}

function getDistPath() {
  return path.join(
    getDistRoot(),
    `${getExecutableName()}-${process.platform}-${os.arch()}`
  )
}

function getExecutableName() {
  const suffix = process.env.NODE_ENV === 'development' ? '-dev' : ''

  if (process.platform === 'win32') {
    return `${getWindowsIdentifierName()}${suffix}`
  } else if (process.platform === 'linux') {
    return 'desktop'
  } else {
    return productName
  }
}

function getOSXZipName() {
  return `${productName}.zip`
}

function getOSXZipPath() {
  return path.join(getDistPath(), '..', getOSXZipName())
}

function getWindowsInstallerName() {
  const productName = getExecutableName()
  return `${productName}Setup.msi`
}

function getWindowsInstallerPath() {
  return path.join(getDistPath(), '..', 'installer', getWindowsInstallerName())
}

function getWindowsStandaloneName() {
  const productName = getExecutableName()
  return `${productName}Setup.exe`
}

function getWindowsStandalonePath() {
  return path.join(getDistPath(), '..', 'installer', getWindowsStandaloneName())
}

function getWindowsFullNugetPackageName() {
  return `${getWindowsIdentifierName()}-${version}-full.nupkg`
}

function getWindowsFullNugetPackagePath() {
  return path.join(
    getDistPath(),
    '..',
    'installer',
    getWindowsFullNugetPackageName()
  )
}

function getWindowsDeltaNugetPackageName() {
  return `${getWindowsIdentifierName()}-${version}-delta.nupkg`
}

function getWindowsDeltaNugetPackagePath() {
  return path.join(
    getDistPath(),
    '..',
    'installer',
    getWindowsDeltaNugetPackageName()
  )
}

function getWindowsIdentifierName() {
  return 'GitHubDesktop'
}

function getBundleSizes() {
  const rendererStats = fs.statSync(
    path.join(projectRoot, 'out', 'renderer.js')
  )
  const mainStats = fs.statSync(path.join(projectRoot, 'out', 'main.js'))
  return { rendererSize: rendererStats.size, mainSize: mainStats.size }
}

function getReleaseBranchName() {
  let branchName
  if (process.platform === 'darwin') {
    branchName = process.env.CIRCLE_BRANCH
  } else if (process.platform === 'win32') {
    branchName = process.env.APPVEYOR_REPO_BRANCH
  }

  return branchName || ''
}

function getReleaseChannel() {
  // Branch name format: __release-CHANNEL-DEPLOY_ID
  const pieces = getReleaseBranchName().split('-')
  if (pieces.length < 3 || pieces[0] !== '__release') {
    return process.env.NODE_ENV || 'development'
  }

  return pieces[1]
}

function getReleaseSHA() {
  // Branch name format: __release-CHANNEL-DEPLOY_ID
  const pieces = getReleaseBranchName().split('-')
  if (pieces.length < 3 || pieces[0] !== '__release') {
    return null
  }

  return pieces[2]
}

function getUpdatesURL() {
  return `https://central.github.com/api/deployments/desktop/desktop/latest?version=${version}&env=${getReleaseChannel()}`
}

function shouldMakeDelta() {
  // Only production and beta channels include deltas. Test releases aren't
  // necessarily sequential so deltas wouldn't make sense.
  const channelsWithDeltas = ['production', 'beta']
  return channelsWithDeltas.indexOf(getReleaseChannel()) > -1
}

module.exports = {
  getDistRoot,
  getDistPath,
  getOSXZipName,
  getOSXZipPath,
  getWindowsInstallerName,
  getWindowsInstallerPath,
  getWindowsStandaloneName,
  getWindowsStandalonePath,
  getWindowsFullNugetPackageName,
  getWindowsFullNugetPackagePath,
  getWindowsIdentifierName,
  getBundleSizes,
  getReleaseChannel,
  getReleaseSHA,
  getUpdatesURL,
  getWindowsDeltaNugetPackageName,
  getWindowsDeltaNugetPackagePath,
  shouldMakeDelta,
  getReleaseBranchName,
  getExecutableName,
}
