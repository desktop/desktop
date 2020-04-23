/* eslint-disable no-sync */

import * as fs from 'fs-extra'
import * as cp from 'child_process'
import * as path from 'path'
import * as crypto from 'crypto'
import * as electronInstaller from 'electron-winstaller'

import { getProductName, getCompanyName } from '../app/package-info'
import {
  getDistPath,
  getDistRoot,
  getOSXZipPath,
  getWindowsIdentifierName,
  getWindowsStandaloneName,
  getWindowsInstallerName,
  shouldMakeDelta,
  getUpdatesURL,
  getIconFileName,
} from './dist-info'
import { isAppveyor } from './build-platforms'

import { packageElectronBuilder } from './package-electron-builder'
import { packageDebian } from './package-debian'

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

  if (isAppveyor()) {
    cp.execSync(`powershell ${setupCertificatePath}`)
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

  if (isAppveyor()) {
    const certificatePath = path.join(__dirname, 'windows-certificate.pfx')
    options.signWithParams = `/f ${certificatePath} /p ${
      process.env.WINDOWS_CERT_PASSWORD
    } /tr http://timestamp.digicert.com /td sha256 /fd sha256`
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

function getSha256Checksum(fullPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const algo = 'sha256'
    const shasum = crypto.createHash(algo)

    const s = fs.createReadStream(fullPath)
    s.on('data', function(d) {
      shasum.update(d)
    })
    s.on('error', err => {
      reject(err)
    })
    s.on('end', function() {
      const d = shasum.digest('hex')
      resolve(d)
    })
  })
}

async function generateChecksums(files: Array<string>) {
  const distRoot = getDistRoot()

  const checksums = new Map<string, string>()

  for (const f of files) {
    const checksum = await getSha256Checksum(f)
    checksums.set(f, checksum)
  }

  let checksumsText = `Checksums: \n`

  for (const [fullPath, checksum] of checksums) {
    const fileName = path.basename(fullPath)
    checksumsText += `${checksum} - ${fileName}\n`
  }

  const checksumFile = path.join(distRoot, 'checksums.txt')

  await fs.writeFile(checksumFile, checksumsText)
}

async function packageLinux() {
  const helperPath = path.join(getDistPath(), 'chrome-sandbox')
  const exists = fs.pathExistsSync(helperPath)

  if (exists) {
    console.log('Updating file mode for chrome-sandbox…')
    fs.chmodSync(helperPath, 0o4755)
  }

  const files = await packageElectronBuilder()
  const debianPackage = await packageDebian()

  const installers = [...files, debianPackage]

  console.log(`Installers created:`)
  for (const installer of installers) {
    console.log(` - ${installer}`)
  }

  generateChecksums(installers)
}
