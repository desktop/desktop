import * as distInfo from './dist-info'
import * as gitInfo from '../app/git-info'
import * as packageInfo from '../app/package-info'
import * as platforms from './build-platforms'

if (!distInfo.isPublishable()) {
  console.log('Not a publishable build. Skipping publish.')
  process.exit(0)
}

const releaseSHA = distInfo.getReleaseSHA()
if (releaseSHA == null) {
  console.log(`No release SHA found for build. Skipping publish.`)
  process.exit(0)
}

const currentTipSHA = gitInfo.getSHA()
if (!currentTipSHA.toUpperCase().startsWith(releaseSHA!.toUpperCase())) {
  console.log(
    `Current tip '${currentTipSHA}' does not match release SHA '${releaseSHA}'. Skipping publish.`
  )
  process.exit(0)
}

import * as Fs from 'fs'
import { execSync } from 'child_process'
import * as AWS from 'aws-sdk'
import * as Crypto from 'crypto'
import request from 'request'

console.log('Packaging…')
execSync('yarn package', { stdio: 'inherit' })

const sha = platforms.getSha().substr(0, 8)

function getSecret() {
  if (process.env.DEPLOYMENT_SECRET != null) {
    return process.env.DEPLOYMENT_SECRET
  }

  throw new Error(
    `Unable to get deployment secret environment variable. Deployment aborting...`
  )
}

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

uploadPromise!
  .then(artifacts => {
    const names = artifacts.map(function (item, index) {
      return item.name
    })
    console.log(`Uploaded artifacts: ${names}`)
    return updateDeploy(artifacts, getSecret())
  })
  .catch(e => {
    console.error(`Publishing failed: ${e}`)
    process.exit(1)
  })

function uploadOSXAssets() {
  const uploads = [upload(distInfo.getOSXZipName(), distInfo.getOSXZipPath())]
  return Promise.all(uploads)
}

function uploadWindowsAssets() {
  const uploads = [
    upload(
      distInfo.getWindowsInstallerName(),
      distInfo.getWindowsInstallerPath()
    ),
    upload(
      distInfo.getWindowsStandaloneName(),
      distInfo.getWindowsStandalonePath()
    ),
    upload(
      distInfo.getWindowsFullNugetPackageName(),
      distInfo.getWindowsFullNugetPackagePath()
    ),
  ]

  if (distInfo.shouldMakeDelta()) {
    uploads.push(
      upload(
        distInfo.getWindowsDeltaNugetPackageName(),
        distInfo.getWindowsDeltaNugetPackagePath()
      )
    )
  }

  return Promise.all(uploads)
}

interface IUploadResult {
  name: string
  url: string
  size: number
  sha: string
}

function upload(assetName: string, assetPath: string) {
  const s3Info = {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  }
  const s3 = new AWS.S3(s3Info)

  const bucket = process.env.S3_BUCKET || ''
  const key = `releases/${packageInfo.getVersion()}-${sha}/${assetName.replace(
    / /g,
    ''
  )}`
  const url = `https://s3.amazonaws.com/${bucket}/${key}`

  const uploadParams = {
    Bucket: bucket,
    ACL: 'public-read',
    Key: key,
    Body: Fs.createReadStream(assetPath),
  }

  return new Promise<IUploadResult>((resolve, reject) => {
    s3.upload(
      uploadParams,
      (error: Error, data: AWS.S3.ManagedUpload.SendData) => {
        if (error != null) {
          reject(error)
        } else {
          // eslint-disable-next-line no-sync
          const stats = Fs.statSync(assetPath)
          const hash = Crypto.createHash('sha1')
          hash.setEncoding('hex')
          const input = Fs.createReadStream(assetPath)

          hash.on('finish', () => {
            const sha = hash.read() as string
            resolve({ name: assetName, url, size: stats['size'], sha })
          })

          input.pipe(hash)
        }
      }
    )
  })
}

function createSignature(body: any, secret: string) {
  const hmac = Crypto.createHmac('sha1', secret)
  hmac.update(JSON.stringify(body))
  return `sha1=${hmac.digest('hex')}`
}

function updateDeploy(artifacts: ReadonlyArray<IUploadResult>, secret: string) {
  const { rendererSize, mainSize } = distInfo.getBundleSizes()
  const body = {
    context: process.platform,
    branch_name: platforms.getReleaseBranchName(),
    artifacts,
    stats: {
      platform: process.platform,
      rendererBundleSize: rendererSize,
      mainBundleSize: mainSize,
    },
  }
  const signature = createSignature(body, secret)
  const options = {
    method: 'POST',
    url: 'https://central.github.com/api/deploy_built',
    headers: {
      'X-Hub-Signature': signature,
    },
    json: true,
    body,
  }

  return new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error) {
        reject(error)
        return
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Received a non-200 response (${
              response.statusCode
            }): ${JSON.stringify(body)}`
          )
        )
        return
      }

      resolve()
    })
  })
}
