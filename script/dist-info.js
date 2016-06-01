'use strict'

const path = require('path')

const projectRoot = path.join(__dirname, '..')
const appPackage = require(path.join(projectRoot, 'package.json'))

function getDistPath () {
  return path.join(projectRoot, 'dist', `${appPackage.productName}-${process.platform}-x64`)
}

function getProductName () {
  return appPackage.productName
}

function getCompanyName () {
  return appPackage.companyName
}

function getVersion () {
  return appPackage.version
}

function getOSXZipPath () {
  const productName = getProductName()
  return path.join(getDistPath(), '..', `${productName}.zip`)
}

function getWindowsInstallerPath () {
  const productName = getProductName()
  return path.join(getDistPath(), '..', 'installer', `${productName}Setup.msi`)
}

module.exports = {getDistPath, getProductName, getCompanyName, getVersion, getOSXZipPath, getWindowsInstallerPath}
