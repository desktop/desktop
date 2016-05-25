'use strict'

const path = require('path')

const projectRoot = path.join(__dirname, '..')
const appPackage = require(path.join(projectRoot, 'package.json'))

module.exports.getDistPath = function () {
  return path.join(projectRoot, 'dist', `${appPackage.productName}-${process.platform}-x64`)
}

module.exports.getProductName = function () {
  return appPackage.productName
}
