/* eslint-disable no-sync */
import * as distInfo from './dist-info'
import * as gitInfo from '../app/git-info'
import * as packageInfo from '../app/package-info'
import * as platforms from './build-platforms'
import * as Fs from 'fs'
import { execSync } from 'child_process'
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import * as Crypto from 'crypto'
import fetch from 'node-fetch'
import { getFileHash } from '../app/src/lib/get-file-hash'
import { stat } from 'fs/promises'

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

console.log('Packaging…')
execSync('yarn package', { stdio: 'inherit' })

const sha = platforms.getSha().substring(0, 8)

function getSecret() {
  if (process.env.DEPLOYMENT_SECRET != null) {
    return process.env.DEPLOYMENT_SECRET
  }

  throw new Error(
    `Unable to get deployment secret environment variable. Deployment aborting...`
  )
}

console.log('Uploading…')

let uploadPromise
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
  // For the nuget packages, include the architecture infix in the asset name
  // when they're uploaded.
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
      distInfo.getWindowsFullNugetPackageName(true),
      distInfo.getWindowsFullNugetPackagePath()
    ),
  ]

  // Even if we should make a delta, it might not exist (if it's the first time
  // we publish a nuget package of the app... for example, when we added support
  // for ARM64).
  if (
    distInfo.shouldMakeDelta() &&
    Fs.existsSync(distInfo.getWindowsDeltaNugetPackagePath())
  ) {
    uploads.push(
      upload(
        distInfo.getWindowsDeltaNugetPackageName(true),
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

async function upload(assetName: string, assetPath: string) {
  const azureBlobService = await getAzureBlobService()
  const container = process.env.AZURE_BLOB_CONTAINER || ''
  const cleanAssetName = assetName.replace(/ /g, '')
  const blob = `releases/${packageInfo.getVersion()}-${sha}/${cleanAssetName}`
  const url = `${process.env.AZURE_STORAGE_URL}/${container}/${blob}`

  const blockBlobClient = azureBlobService.getBlockBlobClient(blob)

  await blockBlobClient.uploadFile(assetPath)

  const { size } = await stat(assetPath)
  const hash = await getFileHash(assetPath, 'sha1')

  return { name: assetName, url, size, sha: hash }
}

async function getAzureBlobService() {
  const {
    AZURE_STORAGE_ACCOUNT: account,
    AZURE_STORAGE_ACCESS_KEY: key,
    AZURE_BLOB_CONTAINER: container,
  } = process.env

  if (account === undefined || key === undefined || container === undefined) {
    throw new Error('Invalid azure storage credentials')
  }

  const blobServiceClient = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new StorageSharedKeyCredential(account, key)
  )
  const containerClient = blobServiceClient.getContainerClient(container)

  try {
    await containerClient.createIfNotExists({ access: 'blob' })
  } catch (e) {
    console.error(e)
    throw new Error(`Failed ensuring container "${container}" aborting...`)
  }

  return containerClient
}

function createSignature(body: any, secret: string) {
  const hmac = Crypto.createHmac('sha1', secret)
  hmac.update(JSON.stringify(body))
  return `sha1=${hmac.digest('hex')}`
}

function getContext() {
  return (
    process.platform +
    (distInfo.getDistArchitecture() === 'arm64' ? '-arm64' : '')
  )
}

async function updateDeploy(
  artifacts: ReadonlyArray<IUploadResult>,
  secret: string
) {
  const { rendererSize, mainSize } = distInfo.getBundleSizes()
  const body = {
    context: getContext(),
    branch_name: platforms.getReleaseBranchName(),
    artifacts,
    stats: {
      platform: process.platform,
      rendererBundleSize: rendererSize,
      mainBundleSize: mainSize,
    },
  }

  const signature = createSignature(body, secret)
  const url = 'https://central.github.com/api/deploy_built'

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-Hub-Signature': signature },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      `Unexpected response while updating deploy ${response.status} ${response.statusText}`
    )
  }
}
