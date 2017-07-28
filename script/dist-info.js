'use strict'

const path = require('path')
const os = require('os')
const fs = require('fs')

const projectRoot = path.join(__dirname, '..')
const appPackage = require(path.join(projectRoot, 'app', 'package.json'))

function getDistPath() {
  return path.join(
    projectRoot,
    'dist',
    `${getExecutableName()}-${process.platform}-x64`
  )
}

function getExecutableName() {
  const suffix = process.env.NODE_ENV === 'development' ? '-dev' : ''

  return process.platform === 'win32'
    ? `${getWindowsIdentifierName()}${suffix}`
    : getProductName()
}

function getProductName() {
  const productName = appPackage.productName
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

function getCompanyName() {
  return appPackage.companyName
}

function getVersion() {
  return appPackage.version
}

function getOSXZipName() {
  const productName = getProductName()
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
  return `${getWindowsIdentifierName()}-${getVersion()}-full.nupkg`
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
  return `${getWindowsIdentifierName()}-${getVersion()}-delta.nupkg`
}

function getWindowsDeltaNugetPackagePath() {
  return path.join(
    getDistPath(),
    '..',
    'installer',
    getWindowsDeltaNugetPackageName()
  )
}

function getBundleID() {
  return appPackage.bundleID
}

function getUserDataPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA, getExecutableName())
  } else if (process.platform === 'darwin') {
    const home = os.homedir()
    return path.join(home, 'Library', 'Application Support', getProductName())
  } else if (process.platform === 'linux') {
    if (process.env.XDG_CONFIG_HOME) {
      return path.join(process.env.XDG_CONFIG_HOME, getProductName())
    }
    const home = os.homedir()
    return path.join(home, '.config', getProductName())
  } else {
    console.error(
      `I dunno how to resolve the user data path for ${process.platform} ${process.arch} :(`
    )
    process.exit(1)
  }
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
    branchName = process.env.TRAVIS_BRANCH
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

function getUpdatesURL() {
  return `https://central.github.com/api/deployments/desktop/desktop/latest?version=${getVersion()}&env=${getReleaseChannel()}`
}

function shouldMakeDelta() {
  // Only production and beta channels include deltas. Test releases aren't
  // necessarily sequential so deltas wouldn't make sense.
  const channelsWithDeltas = ['production', 'beta']
  return channelsWithDeltas.indexOf(getReleaseChannel()) > -1
}

module.exports = {
  getDistPath,
  getProductName,
  getCompanyName,
  getVersion,
  getOSXZipName,
  getOSXZipPath,
  getWindowsInstallerName,
  getWindowsInstallerPath,
  getWindowsStandaloneName,
  getWindowsStandalonePath,
  getWindowsFullNugetPackageName,
  getWindowsFullNugetPackagePath,
  getBundleID,
  getUserDataPath,
  getWindowsIdentifierName,
  getBundleSizes,
  getReleaseChannel,
  getUpdatesURL,
  getWindowsDeltaNugetPackageName,
  getWindowsDeltaNugetPackagePath,
  shouldMakeDelta,
  getReleaseBranchName,
  getExecutableName,
}
