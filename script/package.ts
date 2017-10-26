/* eslint-disable no-sync */

import * as fs from 'fs-extra'
import * as cp from 'child_process'
import * as path from 'path'
import * as electronInstaller from 'electron-winstaller'
import {
  getDistRoot,
  getDistPath,
  getProductName,
  getOSXZipPath,
  getWindowsIdentifierName,
  getCompanyName,
  getWindowsStandaloneName,
  getWindowsInstallerName,
  shouldMakeDelta,
  getUpdatesURL,
} from './dist-info'

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

  cp.execSync(
    `ditto -ck --keepParent "${distPath}/${productName}.app" "${dest}"`
  )
  console.log(`Zipped to ${dest}`)
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

  if (process.env.APPVEYOR) {
    cp.execSync(`powershell ${setupCertificatePath}`)
  }

  const iconSource = path.join(
    __dirname,
    '..',
    'app',
    'static',
    'logos',
    'icon-logo.ico'
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

  if (process.env.APPVEYOR) {
    const certificatePath = path.join(__dirname, 'windows-certificate.pfx')
    options.signWithParams = `/f ${certificatePath} /p ${process.env
      .WINDOWS_CERT_PASSWORD} /tr http://timestamp.digicert.com /td sha256`
  }

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

function packageRedhat() {
  const installer: ElectronInstallerRedhat = require('electron-installer-redhat')

  const options = {
    src: distPath,
    dest: outputDir,
    arch: 'amd64',
  }

  return new Promise((resolve, reject) => {
    console.log('Creating .rpm package...')
    installer(options, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

function packageDebian() {
  const installer: ElectronInstallerDebian = require('electron-installer-debian')

  const options = {
    src: distPath,
    dest: outputDir,
    arch: 'amd64',
  }

  return new Promise((resolve, reject) => {
    console.log('Creating .deb package...')
    installer(options, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

function packageAppImage() {
  // Because electron-builder's CLI has some limits, we need to
  // implement a couple of workarounds.
  //
  // First, it'll use `dist/make` for it's output directory, which
  // results in this vague error when the directory doesn't exist:
  //
  // libburn : SORRY : Neither stdio-path nor its directory exist
  //
  // so let's just trash it (if already existing) and create the directory
  const makeDir = path.join(getDistRoot(), 'make')
  fs.removeSync(makeDir)
  fs.mkdirSync(makeDir)

  const installer: ElectronInstallerAppImage = require('electron-installer-appimage')

  const options = {
    dir: distPath,
    targetArch: 'x64',
  }

  return installer.default(options).then(() => {
    // Second, we need to move the relevant files from dist/make up to
    // the installers directory so it's alongside the other packages
    cp.execSync(`cp ${makeDir}/*.AppImage ${outputDir}`)
  })
}

async function packageLinux(): Promise<void> {
  try {
    await packageRedhat()
    await packageDebian()
    await packageAppImage()
    console.log(`Successfully created packages at ${outputDir}`)
  } catch (e) {
    console.log(`error during packaging: ${e}`)
  }
}
