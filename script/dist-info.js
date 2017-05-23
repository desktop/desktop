'use strict'

const path = require('path')
const os = require('os')

const projectRoot = path.join(__dirname, '..')
const appPackage = require(path.join(projectRoot, 'app', 'package.json'))

function getTargetPlatform () {
  const targetPlatform = process.env.TARGET_PLATFORM || process.platform
  if(targetPlatform !== 'darwin' && targetPlatform !== 'win32') {
    console.error(`Exiting - I'm not set up to work on ${targetPlatform} yet! :(`)
    process.exit(1)
  }

  return targetPlatform
}

function getDistPath () {
  return path.join(projectRoot, 'dist', `${getProductName()}-${getTargetPlatform()}-x64`)
}

function getProductName () {
  const productName = appPackage.productName
  return process.env.NODE_ENV === 'development' ? `${productName}-dev` : productName
}

function getCompanyName () {
  return appPackage.companyName
}

function getVersion () {
  return appPackage.version
}

function getOSXZipName () {
  const productName = getProductName()
  return `${productName}.zip`
}

function getOSXZipPath () {
  return path.join(getDistPath(), '..', getOSXZipName())
}

function getWindowsInstallerName () {
  const productName = getProductName()
  return `${productName}Setup.msi`
}

function getWindowsInstallerPath () {
  return path.join(getDistPath(), '..', 'installer', getWindowsInstallerName())
}

function getWindowsStandaloneName () {
  const productName = getProductName()
  return `${productName}Setup.exe`
}

function getWindowsStandalonePath () {
  return path.join(getDistPath(), '..', 'installer', getWindowsStandaloneName())
}

function getWindowsFullNugetPackageName () {
  return `${getWindowsIdentifierName()}-${getVersion()}-full.nupkg`
}

function getWindowsFullNugetPackagePath () {
  return path.join(getDistPath(), '..', 'installer', getWindowsFullNugetPackageName())
}

function getBundleID () {
  return appPackage.bundleID
}

function getUserDataPath () {
  if (getTargetPlatform() === 'win32') {
    return path.join(process.env.APPDATA, getProductName())
  } else if (getTargetPlatform() === 'darwin') {
    const home = os.homedir()
    return path.join(home, 'Library', 'Application Support', getProductName())
  }
}

function getWindowsIdentifierName () {
  return 'GitHubDesktop'
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
  getTargetPlatform
}
