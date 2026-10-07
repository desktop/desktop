import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAppInstallCommands, getNpmCommand } from './npm'

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
