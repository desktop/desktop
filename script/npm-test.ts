import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cp, mkdir, readFile, realpath, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createTempDirectory } from '../app/test/helpers/temp'
import { getAppInstallCommands, getNpmCommand } from './npm'

const execFileP = promisify(execFile)

describe('npm commands', () => {
  it('uses Node and preserves arguments without a shell', () => {
    const cli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
    const args = ['run', 'prettier', '--', '--write', 'path with spaces.json']

    assert.deepEqual(getNpmCommand(args, cli), {
      executable: process.execPath,
      args: [cli, ...args],
    })
  })

  it('fails explicitly when the npm CLI is missing', () => {
    assert.throws(() => getNpmCommand([], ''), /Cannot find the npm CLI/)
  })

  it('validates webpack loader options with compatible Ajv peers', async () => {
    const { validate } = await import('schema-utils')
    const schema: Parameters<typeof validate>[0] = {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
    }
    validate(schema, { enabled: true })
    assert.throws(() => validate(schema, { enabled: 'invalid' }), /boolean/)
  })

  it('downloads legacy registry prebuilds without npm _from metadata', async t => {
    const root = await createTempDirectory(t)
    const packageRoot = join(root, 'node_modules', 'registry-js')
    await mkdir(packageRoot, { recursive: true })
    await cp(
      resolve(__dirname, '../app/.prebuild-installrc'),
      join(root, '.prebuild-installrc')
    )
    await writeFile(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: 'registry-js',
        version: '1.16.0',
        repository: 'desktop/registry-js',
        config: { runtime: 'napi', target: 3 },
        binary: { napi_versions: [3] },
      })
    )
    const prebuildCli = require.resolve('prebuild-install/bin', {
      paths: [resolve(__dirname, '../app')],
    })
    const { stdout } = await execFileP(
      process.execPath,
      [
        '-e',
        `const fromPrebuild = require('module').createRequire(process.argv[1])
const download = fromPrebuild.resolve('./download')
require.cache[download] = { exports: (url, options, callback) => {
  console.log(url)
  callback(null)
} }
require(process.argv[1])`,
        prebuildCli,
        '--platform=win32',
        '--arch=x64',
      ],
      {
        cwd: packageRoot,
        env: { ...process.env, npm_config_user_agent: 'npm/11 node/v24' },
      }
    )
    assert.match(stdout, /registry-js-v1\.16\.0-napi-v3-win32-x64\.tar\.gz/)
  })

  it('skips only Koffi install scripts, preserving other native hooks', async t => {
    const root = await realpath(await createTempDirectory(t))
    const app: { readonly allowScripts?: Readonly<Record<string, boolean>> } =
      JSON.parse(
        await readFile(resolve(__dirname, '../app/package.json'), 'utf8')
      )
    await cp(resolve(__dirname, '../.npmrc'), join(root, '.npmrc'))
    for (const name of ['koffi', 'other-native']) {
      const packageRoot = join(root, 'node_modules', name)
      await mkdir(packageRoot, { recursive: true })
      await writeFile(
        join(packageRoot, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          scripts: { install: 'node install.cjs' },
        })
      )
      await writeFile(
        join(packageRoot, 'install.cjs'),
        "require('fs').writeFileSync('hook-ran', 'yes')"
      )
    }
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'native-install-policy-test',
        private: true,
        allowScripts: app.allowScripts,
        dependencies: {
          koffi: '1.0.0',
          'other-native': '1.0.0',
        },
      })
    )
    await writeFile(
      join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: 'native-install-policy-test',
            dependencies: { koffi: '1.0.0', 'other-native': '1.0.0' },
          },
          ...Object.fromEntries(
            ['koffi', 'other-native'].map(name => [
              `node_modules/${name}`,
              {
                version: '1.0.0',
                resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
                hasInstallScript: true,
              },
            ])
          ),
        },
      })
    )
    const npm = getNpmCommand([
      'rebuild',
      '--prefix',
      root,
      '--ignore-scripts=false',
      '--no-audit',
      '--no-fund',
    ])
    await execFileP(npm.executable, npm.args, { cwd: root })

    await assert.rejects(readFile(join(root, 'node_modules/koffi/hook-ran')), {
      code: 'ENOENT',
    })
    assert.equal(
      await readFile(join(root, 'node_modules/other-native/hook-ran'), 'utf8'),
      'yes'
    )
  })

  for (const arch of ['arm64', 'x64']) {
    it(`keeps app installs frozen for npm ci targeting ${arch}`, () => {
      assert.deepEqual(getAppInstallCommands('ci', arch), [
        ['ci', '--prefix', 'app', '--cpu', arch, '--foreground-scripts'],
      ])
    })

    it(`syncs locks then rebuilds local sources for npm install targeting ${arch}`, () => {
      assert.deepEqual(getAppInstallCommands('install', arch), [
        [
          'install',
          '--prefix',
          'app',
          '--cpu',
          arch,
          '--foreground-scripts',
          '--package-lock-only',
          '--ignore-scripts',
        ],
        ['ci', '--prefix', 'app', '--cpu', arch, '--foreground-scripts'],
      ])
    })
  }
})
