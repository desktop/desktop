/* eslint-disable no-sync */

import * as path from 'path'
import * as cp from 'child_process'
import * as fs from 'fs'
import { getProductName, getVersion, getCompanyName } from '../app/package-info'
import {
  getDistPath,
  getDistRoot,
  getDistArchitecture,
  getWindowsIdentifierName,
} from './dist-info'

if (process.platform !== 'win32') {
  console.error('MSIX packaging is only supported on Windows.')
  process.exit(1)
}

const distPath = getDistPath()
const outputDir = getDistRoot()

if (!fs.existsSync(distPath)) {
  console.error(
    `Could not find the built app at ${distPath}. ` +
      'Run yarn build:prod before packaging.'
  )
  process.exit(1)
}

packageMSIX()

function packageMSIX() {
  const productName = getProductName()
  const version = normalizeVersion(getVersion())
  const arch = getDistArchitecture()
  const executableName = getWindowsIdentifierName()
  const publisherDisplayName = getCompanyName()
  const publisher = process.env.MSIX_PUBLISHER || 'CN=YOURNAME'

  console.log(`Packaging ${productName} ${version} (${arch}) as MSIX...`)

  // Find MakeAppx.exe from the Windows SDK before injecting any files
  // into the dist folder, so an early exit here leaves the folder clean.
  const makeAppx = findMakeAppx()
  if (makeAppx === null) {
    console.error(
      'Could not find MakeAppx.exe. ' +
        'Install the Windows 10 SDK or set the MAKEAPPX_PATH environment variable.'
    )
    process.exit(1)
  }
  console.log(`Using MakeAppx.exe at ${makeAppx}`)

  // Write the resolved AppxManifest.xml into the dist folder
  const templatePath = path.join(
    __dirname,
    'windows-store-assets',
    'AppxManifest.xml'
  )
  if (!fs.existsSync(templatePath)) {
    console.error(`AppxManifest template not found at ${templatePath}`)
    process.exit(1)
  }

  let manifest = fs.readFileSync(templatePath, 'utf8')
  manifest = manifest
    .replace(/\{ProductName\}/g, escapeXml(executableName))
    .replace(/\{Version\}/g, version)
    .replace(/\{Architecture\}/g, arch)
    .replace(/\{ExecutableName\}/g, executableName)
    .replace(/\{DisplayName\}/g, escapeXml(productName))
    .replace(/\{PublisherDisplayName\}/g, escapeXml(publisherDisplayName))
    .replace(/\{Publisher\}/g, escapeXml(publisher))

  const manifestDest = path.join(distPath, 'AppxManifest.xml')
  fs.writeFileSync(manifestDest, manifest)
  console.log(`Wrote AppxManifest.xml to ${manifestDest}`)

  // Copy a placeholder logo into the dist folder. The manifest references
  // this path for Store tile images. A real submission should replace this
  // with properly sized tile assets.
  const logoSrc = path.resolve(
    __dirname,
    '../app/static/common/windows-logo-64x64@2x.png'
  )
  const logoDir = path.join(distPath, 'StoreLogo')
  if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true })
  }
  const logoDest = path.join(logoDir, 'StoreLogo.png')
  fs.copyFileSync(logoSrc, logoDest)
  console.log(`Copied placeholder logo to ${logoDest}`)

  const msixName = `${executableName}-${arch}.msix`
  const msixPath = path.join(outputDir, msixName)

  // Remove an existing .msix if present so MakeAppx /o doesn't prompt
  if (fs.existsSync(msixPath)) {
    fs.unlinkSync(msixPath)
  }

  const args = ['pack', '/d', distPath, '/p', msixPath, '/o']

  console.log(`Running: "${makeAppx}" ${args.join(' ')}`)
  const result = cp.spawnSync(makeAppx, args, { stdio: 'inherit' })

  // Clean up files we injected into the dist folder so they do not
  // leak into subsequent packaging steps (e.g. Squirrel).
  for (const injected of [manifestDest, logoDir]) {
    fs.rmSync(injected, { recursive: true, force: true })
  }

  if (result.error) {
    console.error(`Failed to start MakeAppx.exe: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`MakeAppx.exe exited with code ${result.status}`)
    process.exit(1)
  }

  console.log(`MSIX package created at ${msixPath}`)
}

/**
 * Escape special XML characters in a string so it can be safely
 * inserted into an XML attribute or element value.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Normalize a semver version string to the four-part format that MSIX
 * requires (Major.Minor.Patch.Revision). Any pre-release suffix like
 * "-beta1" is stripped, and ".0" is appended as the revision.
 */
function normalizeVersion(version: string): string {
  // Strip everything after a hyphen (pre-release tag)
  const base = version.split('-')[0]
  const parts = base.split('.')

  if (parts.length < 3) {
    throw new Error(
      `Version "${version}" does not have at least three numeric components.`
    )
  }

  // MSIX requires exactly Major.Minor.Build.Revision
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`
}

/**
 * Look for MakeAppx.exe in well-known Windows SDK locations, preferring
 * the newest SDK version available. Callers can override this by setting
 * the MAKEAPPX_PATH environment variable.
 */
function findMakeAppx(): string | null {
  const envPath = process.env.MAKEAPPX_PATH
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  const sdkRoot = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  if (!fs.existsSync(sdkRoot)) {
    return null
  }

  // List version directories (e.g. "10.0.19041.0") and sort descending
  // using numeric comparison so that e.g. 10.0.22621.0 sorts after 10.0.9999.0
  const versions = fs
    .readdirSync(sdkRoot)
    .filter(d => d.startsWith('10.'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

  for (const ver of versions) {
    const candidate = path.join(sdkRoot, ver, 'x64', 'MakeAppx.exe')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
