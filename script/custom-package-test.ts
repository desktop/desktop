import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { join, resolve } from 'path'
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createTempDirectory } from '../app/test/helpers/temp'
import { getBundleID, getProductName } from '../app/package-info'
import {
  getDistPath,
  getDistRoot,
  getExecutableName,
  getOutPath,
  getWindowsIdentifierName,
  getWindowsInstallerName,
  getWindowsStandaloneName,
  isPublishable,
  shouldMakeDelta,
  getWindowsIconPath,
} from './dist-info'

describe('local Custom packaging', () => {
  const root = resolve(__dirname, '..')

  it('isolates custom resources and installer identity without publishing', t => {
    t.mock.property(process, 'env', {
      ...process.env,
      NODE_ENV: 'production',
      RELEASE_CHANNEL: 'custom',
      npm_config_arch: 'x64',
    })
    assert.equal(getProductName(), 'GitHub Desktop Custom')
    assert.equal(
      getWindowsIconPath(),
      join(root, 'app', 'static', 'logos', 'custom', 'icon-logo.ico')
    )
    assert.equal(getBundleID(), 'com.github.GitHubClientCustom')
    assert.equal(getWindowsIdentifierName(), 'GitHubDesktopCustom')
    assert.equal(getWindowsInstallerName(), 'GitHubDesktopCustomSetup-x64.msi')
    assert.equal(getWindowsStandaloneName(), 'GitHubDesktopCustomSetup-x64.exe')
    assert.equal(getOutPath(), join(root, '.custom-build', 'out'))
    assert.equal(getDistRoot(), join(root, '.custom-build', 'dist'))
    assert.equal(
      getDistPath(),
      join(getDistRoot(), `${getExecutableName()}-${process.platform}-x64`)
    )
    assert.equal(isPublishable(), false)
    assert.equal(shouldMakeDelta(), false)
  })

  it('leaves official production packaging unchanged', t => {
    t.mock.property(process, 'env', {
      ...process.env,
      NODE_ENV: 'production',
      RELEASE_CHANNEL: 'production',
    })
    assert.equal(getProductName(), 'GitHub Desktop')
    assert.equal(
      getWindowsIconPath(),
      join(root, 'app', 'static', 'logos', 'prod', 'icon-logo.ico')
    )
    assert.equal(getWindowsIdentifierName(), 'GitHubDesktop')
    assert.equal(getBundleID(), 'com.github.GitHubClient')
    assert.equal(getOutPath(), join(root, 'out'))
    assert.equal(getDistRoot(), join(root, 'dist'))
    assert.equal(isPublishable(), true)
    assert.equal(shouldMakeDelta(), true)
  })

  it('leaves development packaging unchanged', t => {
    t.mock.property(process, 'env', {
      ...process.env,
      NODE_ENV: 'development',
      RELEASE_CHANNEL: 'development',
    })
    assert.equal(getProductName(), 'GitHub Desktop-dev')
    assert.equal(
      getWindowsIconPath(),
      join(root, 'app', 'static', 'logos', 'dev', 'icon-logo.ico')
    )
    assert.equal(getBundleID(), 'com.github.GitHubClientDev')
    assert.equal(getOutPath(), join(root, 'out'))
    assert.equal(getDistRoot(), join(root, 'dist'))
    assert.equal(isPublishable(), false)
    assert.equal(shouldMakeDelta(), false)
  })

  for (const buildExitCode of [0, 17]) {
    it(
      `handles redirected native warnings and build exit code ${buildExitCode}`,
      { skip: process.platform !== 'win32' },
      async t => {
        const fixture = await createTempDirectory(t)
        await mkdir(join(fixture, 'script'))
        await mkdir(join(fixture, 'vendor'))
        await copyFile(
          join(__dirname, 'package-custom.ps1'),
          join(fixture, 'script', 'package-custom.ps1')
        )
        await writeFile(join(fixture, '.nvmrc'), process.version)
        await writeFile(
          join(fixture, 'vendor', 'yarn-1.21.1.js'),
          `
const fs = require('fs')
console.error('non-fatal native warning')
fs.appendFileSync('tasks.txt', process.argv[2] + '\\n')
if (process.argv[2] === 'build:prod') {
  process.exit(${buildExitCode})
}
fs.mkdirSync('.custom-build/dist', { recursive: true })
for (const ext of ['exe', 'msi']) {
  fs.writeFileSync('.custom-build/dist/GitHubDesktopCustomSetup-x64.' + ext, 'fixture')
}
`
        )
        const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
        const result = promisify(execFile)(
          join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe'
          ),
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `& .\\script\\package-custom.ps1 -NodePath ${quote(
              process.execPath
            )} *> build.log; exit $LASTEXITCODE`,
          ],
          { cwd: fixture, windowsHide: true }
        )
        if (buildExitCode === 0) {
          await result
        } else {
          await assert.rejects(
            result,
            /Yarn build:prod failed \(exit code 17\)/
          )
        }
        assert.equal(
          await readFile(join(fixture, 'tasks.txt'), 'utf8'),
          buildExitCode === 0 ? 'build:prod\npackage\n' : 'build:prod\n'
        )
        const output = await readFile(join(fixture, 'build.log'), 'utf16le')
        assert.ok(output.includes('non-fatal native warning'))
        assert.equal(
          output.includes('Done. Installers are unsigned.'),
          buildExitCode === 0
        )
      }
    )
  }
})
