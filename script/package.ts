/* eslint-disable no-sync */

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
  isPublishable,
  getBundleSizes,
  getDistRoot,
  getDistArchitecture,
  getIconDirectory,
  getExecutableName,
  getLinuxPackageName,
  getLinuxDebArchitecture,
  getLinuxDebVersion,
  getLinuxDebName,
} from './dist-info'
import { isGitHubActions } from './build-platforms'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
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

function getDirectorySizeSync(dir: string): number {
  let size = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      size += getDirectorySizeSync(entryPath)
    } else if (entry.isFile()) {
      size += statSync(entryPath).size
    }
  }
  return size
}

function packageLinux() {
  const packageName = getLinuxPackageName()
  const installDir = `/usr/lib/${packageName}`
  // Ubuntu's apparmor package already ships a profile for
  // /usr/lib/github-desktop/github-desktop (granting the user namespaces
  // Electron's sandbox needs), so we name the executable to match it and only
  // ship our own profile for package names it doesn't cover.
  const executable = `${installDir}/${packageName}`
  const shipAppArmorProfile = packageName !== 'github-desktop'
  const templateDir = join(__dirname, 'linux')
  const stagingDir = join(outputDir, 'deb-staging')
  const dest = join(outputDir, getLinuxDebName())

  const iconSource = path.resolve(
    __dirname,
    '../app/static/linux/icon-logo.png'
  )
  assertExistsSync(iconSource)
  assertExistsSync(join(distPath, getExecutableName()))

  rmSync(stagingDir, { recursive: true, force: true })
  rmSync(dest, { force: true })

  console.log('Packaging for Linux…')

  const appDir = join(stagingDir, installDir)
  cpSync(distPath, appDir, { recursive: true, verbatimSymlinks: true })
  renameSync(join(appDir, getExecutableName()), join(stagingDir, executable))

  const replacements: Record<string, string> = {
    PACKAGE_NAME: packageName,
    PRODUCT_NAME: productName,
    EXECUTABLE: executable,
    SHIP_APPARMOR_PROFILE: shipAppArmorProfile ? '1' : '0',
    AUTH_PROTOCOL:
      process.env.NODE_ENV === 'development'
        ? 'x-github-desktop-dev-auth'
        : 'x-github-desktop-auth',
    VERSION: getLinuxDebVersion(),
    ARCHITECTURE: getLinuxDebArchitecture(),
    INSTALLED_SIZE: `${Math.ceil(getDirectorySizeSync(appDir) / 1024)}`,
  }

  const writeTemplate = (
    template: string,
    destination: string,
    mode = 0o644
  ) => {
    const contents = readFileSync(join(templateDir, template), 'utf8').replace(
      /@@([A-Z_]+)@@/g,
      (match, key: string) => {
        const value = replacements[key]
        if (value === undefined) {
          throw new Error(`Unknown placeholder ${match} in ${template}`)
        }
        return value
      }
    )
    const target = join(stagingDir, destination)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, contents)
    chmodSync(target, mode)
  }

  writeTemplate('control', 'DEBIAN/control')
  writeTemplate('postinst', 'DEBIAN/postinst', 0o755)
  writeTemplate('prerm', 'DEBIAN/prerm', 0o755)
  writeTemplate('postrm', 'DEBIAN/postrm', 0o755)
  writeTemplate(
    'desktop-entry',
    `usr/share/applications/${packageName}.desktop`
  )
  if (shipAppArmorProfile) {
    writeTemplate('apparmor-profile', `etc/apparmor.d/${packageName}`)
  }

  const iconDir = join(stagingDir, 'usr/share/icons/hicolor/512x512/apps')
  mkdirSync(iconDir, { recursive: true })
  cpSync(iconSource, join(iconDir, `${packageName}.png`))

  const binDir = join(stagingDir, 'usr/bin')
  mkdirSync(binDir, { recursive: true })
  symlinkSync(
    path.relative(binDir, join(stagingDir, executable)),
    join(binDir, packageName)
  )

  // Normalize permissions so neither the build machine's umask nor the
  // private (0700) directory electron-packager creates leak into the system
  // directories the package installs into.
  cp.execSync(`chmod -R u+rwX,go+rX,go-w "${stagingDir}"`)

  cp.execSync(`dpkg-deb --build --root-owner-group "${stagingDir}" "${dest}"`, {
    stdio: 'inherit',
  })
  rmSync(stagingDir, { recursive: true, force: true })

  console.log(`Debian package created at ${dest}`)
}
