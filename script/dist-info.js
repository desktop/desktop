'use strict'

const path = require('path')
const os = require('os')
const fs = require('fs')

const projectRoot = path.join(__dirname, '..')
// eslint-disable-next-line import/no-dynamic-require
const appPackage = require(path.join(projectRoot, 'app', 'package.json'))

function getDistRoot() {
  return path.join(projectRoot, 'dist')
}

function getDistPath() {
  return path.join(
    getDistRoot(),
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
    throw new Error(
      `I dunno how to resolve the user data path for ${process.platform} ${process.arch} :(`
    )
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
  return `https://central.github.com/api/deployments/desktop/desktop/latest?version=${getVersion()}&env=${getReleaseChannel()}`
}

function shouldMakeDelta() {
  // Only production and beta channels include deltas. Test releases aren't
  // necessarily sequential so deltas wouldn't make sense.
  const channelsWithDeltas = ['production', 'beta']
  return channelsWithDeltas.indexOf(getReleaseChannel()) > -1
}

function getCLICommands() {
  return fs
    .readdirSync(path.resolve(projectRoot, 'app', 'src', 'cli', 'commands'))
    .filter(name => name.endsWith('.ts'))
    .map(name => name.replace(/\.ts$/, ''))
}

/**
 * Attempt to dereference the given ref without requiring a Git environment
 * to be present. Note that this method will not be able to dereference packed
 * refs but should suffice for simple refs like 'HEAD'.
 *
 * Will throw an error for unborn HEAD.
 *
 * @param {string} gitDir The path to the Git repository's .git directory
 * @param {string} ref    A qualified git ref such as 'HEAD' or 'refs/heads/master'
 */
function revParse(gitDir, ref) {
  const refPath = path.join(gitDir, ref)
  const refContents = fs.readFileSync(refPath)
  const refRe = /^([a-f0-9]{40})|(?:ref: (refs\/.*))$/m
  const refMatch = refRe.exec(refContents)

  if (!refMatch) {
    throw new Error(
      `Could not de-reference HEAD to SHA, invalid ref in ${refPath}: ${refContents}`
    )
  }

  return refMatch[1] || revParse(gitDir, refMatch[2])
}

function getSHA() {
  // CircleCI does some funny stuff where HEAD points to an packed ref, but
  // luckily it gives us the SHA we want in the environment.
  const circleSHA = process.env.CIRCLE_SHA1
  if (circleSHA) {
    return circleSHA
  }

  return revParse(path.resolve(__dirname, '../.git'), 'HEAD')
}

module.exports = {
  getDistRoot,
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
  getReleaseSHA,
  getUpdatesURL,
  getWindowsDeltaNugetPackageName,
  getWindowsDeltaNugetPackagePath,
  shouldMakeDelta,
  getReleaseBranchName,
  getExecutableName,
  getCLICommands,
  getSHA,
}
