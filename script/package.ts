/* eslint-disable no-sync */

import * as cp from 'child_process'
import * as path from 'path'
import * as electronInstaller from 'electron-winstaller'
import { getProductName, getCompanyName } from '../app/package-info'
import {
  getDistPath,
  getExecutableName,
  getOSXZipPath,
  getWindowsIdentifierName,
  getWindowsStandaloneName,
  getWindowsInstallerName,
  shouldMakeDelta,
  getUpdatesURL,
  isPublishable,
  getBundleSizes,
  getDistRoot,
  getDistArchitecture,
  getIconDirectory,
} from './dist-info'
import { isGitHubActions } from './build-platforms'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { getVersion } from '../app/package-info'
import { computeBundleHashSync } from '../app/src/lib/compute-bundle-hash'
import { rename } from 'fs/promises'
import { join } from 'path'
import { assertNonNullable } from '../app/src/lib/fatal-error'

const distPath = getDistPath()
const productName = getProductName()
const outputDir = getDistRoot()

const assertExistsSync = (path: string) => {
  if (!existsSync(path)) {
    throw new Error(`Expected ${path} to exist`)
  }
}

if (process.platform === 'darwin') {
  packageOSX()
} else if (process.platform === 'win32') {
  packageWindows()
} else if (process.platform === 'linux') {
  packageLinux()
} else {
  console.error(`I don't know how to package for ${process.platform} :(`)
  process.exit(1)
}

console.log('Writing bundle size info…')
writeFileSync(
  path.join(getDistRoot(), 'bundle-size.json'),
  JSON.stringify(getBundleSizes())
)

console.log('Writing bundle hash…')
writeFileSync(
  path.join(getDistRoot(), 'bundle-hash.json'),
  JSON.stringify({
    bundleHash: computeBundleHashSync(path.join(__dirname, '..', 'out')),
  })
)

function packageOSX() {
  const dest = getOSXZipPath()
  rmSync(dest, { recursive: true, force: true })

  console.log('Packaging for macOS…')
  cp.execSync(
    `ditto -ck --keepParent "${distPath}/${productName}.app" "${dest}"`
  )
}

function getLinuxArchivePath() {
  return path.join(
    getDistRoot(),
    `${productName.replace(/\s+/g, '')}-linux-${getDistArchitecture()}.tar.gz`
  )
}

function packageLinux() {
  const dest = getLinuxArchivePath()
  rmSync(dest, { force: true })

  console.log('Packaging for Linux…')
  cp.execFileSync('tar', [
    '-czf',
    dest,
    '-C',
    path.dirname(distPath),
    path.basename(distPath),
  ])

  packageDeb()
}

/**
 * Builds a .deb with plain `dpkg-deb` (no extra npm dependencies). The app is
 * installed to /opt/<name>, with a /usr/bin symlink and a .desktop entry that
 * registers the protocol handlers.
 */
function packageDeb() {
  const arch = getDistArchitecture()
  const debArch = arch === 'arm64' ? 'arm64' : 'amd64'
  const exe = getExecutableName()
  const installDir = `opt/${getWindowsIdentifierName()}`
  const root = mkdtempSync(path.join(tmpdir(), 'desktop-deb-'))

  try {
    const appDir = path.join(root, installDir)
    mkdirSync(path.dirname(appDir), { recursive: true })
    cpSync(distPath, appDir, { recursive: true, verbatimSymlinks: true })

    mkdirSync(path.join(root, 'usr', 'bin'), { recursive: true })
    symlinkSync(
      `/${installDir}/${exe}`,
      path.join(root, 'usr', 'bin', 'github-desktop')
    )

    const iconDir = path.join(root, 'usr/share/icons/hicolor/512x512/apps')
    mkdirSync(iconDir, { recursive: true })
    cpSync(
      path.resolve(__dirname, '../app/static/linux/icon-logo.png'),
      path.join(iconDir, 'github-desktop.png')
    )

    const appsDir = path.join(root, 'usr', 'share', 'applications')
    mkdirSync(appsDir, { recursive: true })
    writeFileSync(
      path.join(appsDir, 'github-desktop.desktop'),
      [
        '[Desktop Entry]',
        `Name=${productName}`,
        'Comment=Simple collaboration from your desktop',
        `Exec=/${installDir}/${exe} %U`,
        'Icon=github-desktop',
        'Terminal=false',
        'Type=Application',
        'Categories=Development;RevisionControl;',
        'MimeType=x-scheme-handler/x-github-client;x-scheme-handler/x-github-desktop-auth;x-scheme-handler/github-mac;',
        '',
      ].join('\n')
    )

    const debian = path.join(root, 'DEBIAN')
    mkdirSync(debian)
    writeFileSync(
      path.join(debian, 'control'),
      [
        'Package: github-desktop',
        `Version: ${getVersion()}`,
        'Section: devel',
        'Priority: optional',
        `Architecture: ${debArch}`,
        `Maintainer: ${getCompanyName()}`,
        'Depends: libgtk-3-0, libnss3, libxss1, libsecret-1-0, libgbm1, xdg-utils',
        `Description: ${productName}`,
        ' Simple collaboration from your desktop.',
        '',
      ].join('\n')
    )
    const postinst = path.join(debian, 'postinst')
    writeFileSync(
      postinst,
      '#!/bin/sh\nset -e\nchmod 4755 "/' +
        installDir +
        '/chrome-sandbox" 2>/dev/null || true\n'
    )
    chmodSync(postinst, 0o755)

    // mkdtemp and the packager output are 0700; make everything readable and
    // traversable by all users, otherwise only root can run the installed app.
    cp.execFileSync('chmod', ['-R', 'u+rwX,go+rX', root])

    const dest = path.join(getDistRoot(), `GitHubDesktop-${debArch}.deb`)
    rmSync(dest, { force: true })
    cp.execFileSync('dpkg-deb', ['--root-owner-group', '-b', root, dest], {
      stdio: 'inherit',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function packageWindows() {
  const iconSource = join(getIconDirectory(), 'icon-logo.ico')

  if (!existsSync(iconSource)) {
    console.error(`expected setup icon not found at location: ${iconSource}`)
    process.exit(1)
  }

  const splashScreenPath = path.resolve(
    __dirname,
    '../app/static/logos/win32-installer-splash.gif'
  )

  if (!existsSync(splashScreenPath)) {
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
    const url = new URL(getUpdatesURL())
    // Make sure Squirrel.Windows isn't affected by partially or completely
    // disabled releases.
    url.searchParams.set('bypassStaggeredRelease', '1')
    options.remoteReleases = url.toString()
  }

  if (isGitHubActions() && isPublishable()) {
    assertNonNullable(process.env.RUNNER_TEMP, 'Missing RUNNER_TEMP env var')

    const acsPath = join(process.env.RUNNER_TEMP, 'acs')
    const dlibPath = join(acsPath, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll')

    assertExistsSync(dlibPath)

    const metadataPath = join(acsPath, 'metadata.json')
    const acsMetadata = {
      Endpoint: 'https://wus3.codesigning.azure.net/',
      CodeSigningAccountName: 'GitHubInc',
      CertificateProfileName: 'GitHubInc',
      CorrelationId: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }
    writeFileSync(metadataPath, JSON.stringify(acsMetadata))

    options.signWithParams = `/v /fd SHA256 /tr "http://timestamp.acs.microsoft.com" /td SHA256 /dlib "${dlibPath}" /dmdf "${metadataPath}"`
  }

  console.log('Packaging for Windows…')
  electronInstaller
    .createWindowsInstaller(options)
    .then(() => console.log(`Installers created in ${outputDir}`))
    .then(async () => {
      // electron-winstaller (more specifically Squirrel.Windows) doesn't let
      // us control the name of the nuget packages but we want them to include
      // the architecture similar to how the setup exe and msi do so we'll just
      // have to rename them here after the fact.
      const arch = getDistArchitecture()
      const prefix = `${getWindowsIdentifierName()}-${getVersion()}`

      for (const kind of shouldMakeDelta() ? ['full', 'delta'] : ['full']) {
        const from = join(outputDir, `${prefix}-${kind}.nupkg`)
        const to = join(outputDir, `${prefix}-${arch}-${kind}.nupkg`)

        console.log(`Renaming ${from} to ${to}`)
        await rename(from, to)
      }
    })
    .catch(e => {
      console.error(`Error packaging: ${e}`)
      process.exit(1)
    })
}
