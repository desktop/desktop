'use strict'

const path = require('path')
const cp = require('child_process')
const fs = require('fs')
const distInfo = require('./dist-info')

const distPath = distInfo.getDistPath()
const productName = distInfo.getProductName()

let binaryPath = ''
if (process.platform === 'darwin') {
  binaryPath = path.join(distPath, `${productName}.app`, 'Contents', 'MacOS', `${productName}`)
} else if (process.platform === 'win32') {
  binaryPath = path.join(distPath, `${productName}`)
} else {
  console.error(`I dunno how to run on ${process.arch} :(`)
  process.exit(1)
}

module.exports = function () {
  try {
    const stats = fs.statSync(binaryPath)
    if (!stats.isFile()) {
      return null
    }
  } catch (e) {
    return null
  }

  const env = Object.assign({}, process.env, {NODE_ENV: 'development'})
  return cp.spawn(binaryPath, [], {env})
}
