#!/usr/bin/env node

'use strict'

const TEST_PUBLISH = false

let branchName = ''
if (process.platform === 'darwin') {
  branchName = process.env.TRAVIS_BRANCH
} else if (process.platform === 'win32') {
  branchName = process.env.APPVEYOR_REPO_BRANCH
}

if (!/^__release.*/.test(branchName) && !TEST_PUBLISH) {
  console.log(`${branchName} isn't a release branch. Skipping publish.`)
  process.exit(0)
}

const fs = require('fs')
const cp = require('child_process')
const AWS = require('aws-sdk')
const distInfo = require('./dist-info')
const crypto = require('crypto')
const request = require('request')

console.log('Packaging…')
cp.execSync('npm run package')

let sha = ''
if (process.platform === 'darwin') {
  sha = process.env.TRAVIS_COMMIT
} else if (process.platform === 'win32') {
  sha = process.env.APPVEYOR_REPO_COMMIT
}

sha = sha.substr(0, 8)

console.log('Uploading…')

let uploadPromise = null
if (process.platform === 'darwin') {
  uploadPromise = uploadOSXAssets()
} else if (process.platform === 'win32') {
  uploadPromise = uploadWindowsAssets()
} else {
  console.error(`I dunno how to publish a release for ${process.platform} :(`)
  process.exit(1)
}

uploadPromise
  .then(artifacts => {
    const names = artifacts.map(function(item,index) {
        return item.name;
    })
    console.log(`Uploaded artifacts: ${names}`)
    return updateDeploy(artifacts)
  })
  .catch(e => {
    console.error(`Publishing failed: ${e}`)
    process.exit(1)
  })

function uploadOSXAssets () {
  const uploads = [
    upload(distInfo.getOSXZipName(), distInfo.getOSXZipPath())
  ]
  return Promise.all(uploads)
}

function uploadWindowsAssets () {
  const uploads = [
    upload(distInfo.getWindowsInstallerName(), distInfo.getWindowsInstallerPath()),
    upload(distInfo.getWindowsStandaloneName(), distInfo.getWindowsStandalonePath()),
    upload(distInfo.getWindowsFullNugetPackageName(), distInfo.getWindowsFullNugetPackagePath())
  ]
  return Promise.all(uploads)
}

function upload (assetName, assetPath) {
  const s3Info = {accessKeyId: process.env.S3_KEY, secretAccessKey: process.env.S3_SECRET}
  const s3 = new AWS.S3(s3Info)

  const bucket = process.env.S3_BUCKET
  const key = `releases/${distInfo.getVersion()}-${sha}/${assetName.replace(/ /g, '')}`
  const url = `https://s3.amazonaws.com/${bucket}/${key}`

  const uploadParams = {
    Bucket: bucket,
    ACL: 'public-read',
    Key: key,
    Body: fs.createReadStream(assetPath)
  }

  return new Promise((resolve, reject) => {
    s3.upload(uploadParams, (error, data) => {
      if (error) {
        reject(error)
      } else {
        const stats = fs.statSync(assetPath)
        const hash = crypto.createHash('sha1')
        const input = fs.createReadStream(assetPath)

        hash.on('finish', () => {
          const sha = hash.read().toString('hex')
          resolve({name: assetName, url, size: stats['size'], sha})
        })

        input.pipe(hash)
      }
    })
  })
}

function createSignature (body) {
  const hmac = crypto.createHmac('sha1', process.env.DEPLOYMENT_SECRET)
  hmac.update(JSON.stringify(body))
  return `sha1=${hmac.digest('hex')}`
}

function updateDeploy (artifacts) {
  const body = {
    context: process.platform,
    branch_name: branchName,
    artifacts
  }
  const signature = createSignature(body)
  const options = {
    method: 'POST',
    url: 'https://central.github.com/api/deploy_built',
    headers: {
      'X-Hub-Signature': signature
    },
    json: true,
    body
  }

  return new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error) {
        reject(error)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Received a non-200 response (${response.statusCode}): ${JSON.stringify(body)}`))
        return
      }

      resolve()
    })
  })
}
