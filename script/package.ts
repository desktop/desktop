/* eslint-disable no-sync */

import * as fs from 'fs-extra'
import * as cp from 'child_process'
import * as path from 'path'
import * as electronInstaller from 'electron-winstaller'
import { getProductName, getCompanyName } from '../app/package-info'
import {
  getDistPath,
  getOSXZipPath,
  getWindowsIdentifierName,
  getWindowsStandaloneName,
  getWindowsInstallerName,
  shouldMakeDelta,
  getUpdatesURL,
  getIconFileName,
} from './dist-info'
import { isAppveyor, isGitHubActions } from './build-platforms'

const distPath = getDistPath()
const productName = getProductName()
const outputDir = path.join(distPath, '..', 'installer')

if (process.platform === 'darwin') {
  packageOSX()
} else if (process.platform === 'win32') {
  packageWindows()
} else if (process.platform === 'linux') {
  packageLinux()
} else {
  console.error(`I dunno how to package for ${process.platform} :(`)
  process.exit(1)
}

function packageOSX() {
  const dest = getOSXZipPath()
  fs.removeSync(dest)

  console.log('Packaging for macOS…')
  cp.execSync(
    `ditto -ck --keepParent "${distPath}/${productName}.app" "${dest}"`
  )
}

function packageWindows() {
  const setupCertificatePath = path.join(
    __dirname,
    'setup-windows-certificate.ps1'
  )
  const cleanupCertificatePath = path.join(
    __dirname,
    'cleanup-windows-certificate.ps1'
  )

  if (isAppveyor() || isGitHubActions()) {
    console.log('Installing signing certificate…')
    cp.execSync(`powershell ${setupCertificatePath}`, { stdio: 'inherit' })
  }

  const iconSource = path.join(
    __dirname,
    '..',
    'app',
    'static',
    'logos',
    `${getIconFileName()}.ico`
  )

  if (!fs.existsSync(iconSource)) {
    console.error(`expected setup icon not found at location: ${iconSource}`)
    process.exit(1)
  }

  const splashScreenPath = path.resolve(
    __dirname,
    '../app/static/logos/win32-installer-splash.gif'
  )

  if (!fs.existsSync(splashScreenPath)) {
    console.error(
      `expected setup splash screen gif not found at location: ${splashScreenPath}`
    )
    process.exit(1)
  }

  const iconUrl = 'https://desktop.githubusercontent.com/app-icon.ico'

  const nugetPkgName = getWindowsIdentifierName()
  const options: electronInstaller.Options = {
    name: nugetPkgName,
    appDirectory: distPath,
    outputDirectory: outputDir,
    authors: getCompanyName(),
    iconUrl: iconUrl,
    setupIcon: iconSource,
    loadingGif: splashScreenPath,
    exe: `${nugetPkgName}.exe`,
    title: productName,
    setupExe: getWindowsStandaloneName(),
    setupMsi: getWindowsInstallerName(),
  }

  if (shouldMakeDelta()) {
    options.remoteReleases = getUpdatesURL()
  }

  if (isAppveyor() || isGitHubActions()) {
    const certificatePath = path.join(__dirname, 'windows-certificate.pfx')
    options.signWithParams = `/f ${certificatePath} /p ${process.env.WINDOWS_CERT_PASSWORD} /tr http://timestamp.digicert.com /td sha256 /fd sha256`
  }

  console.log('Packaging for Windows…')
  electronInstaller
    .createWindowsInstaller(options)
    .then(() => {
      console.log(`Installers created in ${outputDir}`)
      cp.execSync(`powershell ${cleanupCertificatePath}`)
    })
    .catch(e => {
      cp.execSync(`powershell ${cleanupCertificatePath}`)
      console.error(`Error packaging: ${e}`)
      process.exit(1)
    })
}

function packageLinux() {
  const electronBuilder = path.resolve(
    __dirname,
    '..',
    'node_modules',
    '.bin',
    'electron-builder'
  )

  const configPath = path.resolve(__dirname, 'electron-builder-linux.yml')

  const args = [
    'build',
    '--prepackaged',
    distPath,
    '--x64',
    '--config',
    configPath,
  ]

  console.log('Packaging for Linux…')
  cp.spawnSync(electronBuilder, args, { stdio: 'inherit' })
}
