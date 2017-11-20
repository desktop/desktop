'use strict'

const path = require('path')

const projectRoot = __dirname
// eslint-disable-next-line import/no-dynamic-require
const appPackage = require(path.join(projectRoot, 'package.json'))

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

function getBundleID() {
  return appPackage.bundleID
}

module.exports = {
  getProductName,
  getCompanyName,
  getVersion,
  getBundleID,
}
