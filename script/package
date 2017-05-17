#!/usr/bin/env node

'use strict'

const fs = require('fs-extra')
const cp = require('child_process')
const path = require('path')
const distInfo = require('./dist-info')

const distPath = distInfo.getDistPath()
const productName = distInfo.getProductName()

if (process.platform === 'darwin') {
  packageOSX()
} else if (process.platform === 'win32') {
  packageWindows()
} else {
  console.error(`I dunno how to package for ${process.platform} :(`)
  process.exit(1)
}

function packageOSX () {
  const dest = distInfo.getOSXZipPath()
  fs.removeSync(dest)

  cp.execSync(`ditto -ck --keepParent "${distPath}/${productName}.app" "${dest}"`)
  console.log(`Zipped to ${dest}`)
}

function packageWindows () {
  const electronInstaller = require('electron-winstaller')
  const outputDir = path.join(distPath, '..', 'installer')
  const setupCertificatePath = path.join(__dirname, 'setup-windows-certificate.ps1')
  const cleanupCertificatePath = path.join(__dirname, 'cleanup-windows-certificate.ps1')

  if (process.env.APPVEYOR) {
    cp.execSync(`powershell ${setupCertificatePath}`)
  }

  const iconSource = path.join(__dirname, '..', 'app', 'static', 'logos', 'icon-logo.ico')

  if (!fs.existsSync(iconSource)) {
    console.error(`expected setup icon not found at location: ${iconSource}`)
    process.exit(1)
  }

  const splashScreenPath = path.resolve(__dirname, '../app/static/logos/win32-installer-splash.gif')

  if (!fs.existsSync(splashScreenPath)) {
    console.error(`expected setup splash screen gif not found at location: ${splashScreenPath}`)
    process.exit(1)
  }

  const iconUrl = 'https://desktop.githubusercontent.com/app-icon.ico'

  const options = {
    name: distInfo.getWindowsIdentifierName(),
    appDirectory: distPath,
    outputDirectory: outputDir,
    authors: distInfo.getCompanyName(),
    iconUrl: iconUrl,
    setupIcon: iconSource,
    loadingGif: splashScreenPath,
    exe: `${productName}.exe`
  }

  if (process.env.APPVEYOR) {
    const certificatePath = path.join(__dirname, 'windows-certificate.pfx')
    options.signWithParams = `/f ${certificatePath} /p ${process.env.WINDOWS_CERT_PASSWORD} /tr http://timestamp.digicert.com /td sha256`
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
