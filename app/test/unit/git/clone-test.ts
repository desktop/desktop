import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'

import { clone } from '../../../src/lib/git/clone'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'
import { exec } from 'dugite'
import { git } from '../../../src/lib/git'
import { isGitError } from '../../../src/lib/git/core'

async function createEmptyBareRepository(
  t: import('node:test').TestContext
): Promise<string> {
  const bareParentPath = await createTempDirectory(t)
  const barePath = path.join(bareParentPath, 'remote.git')
  await git(['init', '--bare', barePath], bareParentPath, 'initBareRepository')
  return barePath
}

describe('git/clone', () => {
  describe('transport policy', () => {
    const savedEnvironment: NodeJS.ProcessEnv = {}

    beforeEach(() => {
      for (const key of ['GIT_ALLOW_PROTOCOL', 'GIT_CONFIG_PARAMETERS']) {
        savedEnvironment[key] = process.env[key]
        delete process.env[key]
      }
    })

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnvironment)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })

    for (const protocol of ['ext', 'ext.exe']) {
      it(`rejects ${protocol} URLs before creating the destination`, async t => {
        const destination = path.join(await createTempDirectory(t), 'cloned')

        await assert.rejects(clone(`${protocol}::`, destination, {}), {
          message: `The "${protocol}" transport is not supported for cloning in ${__APP_NAME__}.`,
        })
        assert.strictEqual(existsSync(destination), false)
      })

      for (const allowProtocol of [
        undefined,
        'ext:ext.exe:file',
        'ext:ext.exe',
      ]) {
        it(`rejects rewrites to ${protocol} with GIT_ALLOW_PROTOCOL=${allowProtocol}`, async t => {
          const destination = path.join(await createTempDirectory(t), 'cloned')
          process.env.GIT_CONFIG_PARAMETERS =
            `'protocol.${protocol}.allow=always' ` +
            `'url.${protocol}::.insteadOf=desktop-clone-test:'`
          if (allowProtocol !== undefined) {
            process.env.GIT_ALLOW_PROTOCOL = allowProtocol
          }

          await assert.rejects(
            clone('desktop-clone-test:', destination, {}),
            (error: unknown) => {
              assert.ok(isGitError(error))
              assert.ok(
                error.result.stderr.includes(
                  `transport '${protocol}' not allowed`
                ),
                error.result.stderr.toString()
              )
              return true
            }
          )
        })
      }
    }

    for (const [url, protocol] of [
      ['https://example.com/owner/repo.git', 'https'],
      ['https://[::1]/owner/repo.git', 'https'],
      ['ssh://git@[::1]/owner/repo.git', 'ssh'],
      ['git@example.com:owner/repo.git', 'ssh'],
      ['git://example.com/owner/repo.git', 'git'],
      ['desktop-test-helper::', 'desktop-test-helper'],
    ]) {
      it(`leaves ${url} transport selection to Git`, async t => {
        const destination = path.join(await createTempDirectory(t), 'cloned')
        // Stop at Git's transport check without connecting or starting a helper.
        process.env.GIT_ALLOW_PROTOCOL = ''

        await assert.rejects(clone(url, destination, {}), (error: unknown) => {
          assert.ok(isGitError(error))
          assert.ok(
            error.result.stderr.includes(`transport '${protocol}' not allowed`),
            error.result.stderr.toString()
          )
          return true
        })
      })
    }

    for (const allowProtocol of [undefined, 'ext:file:ext.exe']) {
      it(`preserves file clones with GIT_ALLOW_PROTOCOL=${allowProtocol}`, async t => {
        const source = await createEmptyBareRepository(t)
        const destination = path.join(await createTempDirectory(t), 'cloned')
        if (allowProtocol !== undefined) {
          process.env.GIT_ALLOW_PROTOCOL = allowProtocol
        }

        await clone(pathToFileURL(source).href, destination, {})

        assert.strictEqual(existsSync(path.join(destination, '.git')), true)
        assert.strictEqual(process.env.GIT_ALLOW_PROTOCOL, allowProtocol)
      })
    }

    for (const allowProtocol of ['', 'https', 'ext:ext.exe']) {
      it(`preserves file restrictions with GIT_ALLOW_PROTOCOL=${allowProtocol}`, async t => {
        const source = await createEmptyBareRepository(t)
        const destination = path.join(await createTempDirectory(t), 'cloned')
        process.env.GIT_ALLOW_PROTOCOL = allowProtocol

        await assert.rejects(
          clone(pathToFileURL(source).href, destination, {}),
          (error: unknown) => {
            assert.ok(isGitError(error))
            assert.ok(
              error.result.stderr.includes("transport 'file' not allowed"),
              error.result.stderr.toString()
            )
            return true
          }
        )
        assert.strictEqual(process.env.GIT_ALLOW_PROTOCOL, allowProtocol)
      })
    }

    for (const [protocol, allowProtocol] of [
      ['file', undefined],
      ['file', 'file:ext:ext.exe'],
      ['ext', 'file:ext:ext.exe'],
      ['ext.exe', 'file:ext:ext.exe'],
    ]) {
      it(`preserves recursive ${protocol} policy with GIT_ALLOW_PROTOCOL=${allowProtocol}`, async t => {
        const submodule = await setupEmptyRepository(t)
        await makeCommit(submodule, {
          entries: [{ path: 'README.md', contents: 'submodule' }],
        })
        const submoduleURL = pathToFileURL(submodule.path).href
        const source = await setupEmptyRepository(t)
        await git(
          [
            '-c',
            'protocol.file.allow=always',
            'submodule',
            'add',
            '--',
            submoduleURL,
            'module',
          ],
          source.path,
          'addSubmodule'
        )
        await makeCommit(source, { entries: [] })

        if (allowProtocol !== undefined) {
          process.env.GIT_ALLOW_PROTOCOL = allowProtocol
        }
        if (protocol !== 'file') {
          process.env.GIT_CONFIG_PARAMETERS =
            `'protocol.${protocol}.allow=always' ` +
            `'url.${protocol}::.insteadOf=${submoduleURL}'`
        }
        const destination = path.join(await createTempDirectory(t), 'cloned')

        if (protocol === 'file' && allowProtocol !== undefined) {
          await clone(source.path, destination, {})
          assert.strictEqual(
            existsSync(path.join(destination, 'module', 'README.md')),
            true
          )
        } else {
          await assert.rejects(
            clone(source.path, destination, {}),
            (error: unknown) => {
              assert.ok(isGitError(error))
              assert.ok(
                error.result.stderr.includes(
                  `transport '${protocol}' not allowed`
                ),
                error.result.stderr.toString()
              )
              return true
            }
          )
        }
      })
    }
  })

  it('clones a local repository', async t => {
    // Create a source repo with a commit
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source.path, clonePath, {})

    assert.equal(existsSync(path.join(clonePath, '.git')), true)
    assert.equal(existsSync(path.join(clonePath, 'README.md')), true)
  })

  it('clones with a specific branch', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    // Create a feature branch on the source
    await exec(['branch', 'feature'], source.path)
    await exec(['checkout', 'feature'], source.path)
    await makeCommit(source, {
      entries: [{ path: 'feature.txt', contents: 'feature' }],
      commitMessage: 'feature commit',
    })
    await exec(['checkout', 'master'], source.path)

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source.path, clonePath, { branch: 'feature' })

    // Verify the feature branch was checked out
    const result = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], clonePath)
    assert.equal(result.stdout.trim(), 'feature')
    assert.equal(existsSync(path.join(clonePath, 'feature.txt')), true)
  })

  it('reports progress when callback is provided', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    const progressEvents: Array<{ kind: string }> = []
    await clone(source.path, clonePath, {}, progress => {
      progressEvents.push({ kind: progress.kind })
    })

    assert.ok(progressEvents.length > 0, 'Expected at least one progress event')
    assert.equal(progressEvents[0].kind, 'clone')
  })

  it('clones with a custom default branch name', async t => {
    // init.defaultBranch only takes effect when the remote's unborn HEAD
    // branch name is not advertised (protocol v0/v1). Force protocol v0
    // so we can verify the option actually drives the result, rather than
    // having the remote's initial-branch setting do the work.
    const savedGitConfigParams = process.env['GIT_CONFIG_PARAMETERS']
    process.env['GIT_CONFIG_PARAMETERS'] = "'protocol.version=0'"
    t.after(() => {
      if (savedGitConfigParams === undefined) {
        delete process.env['GIT_CONFIG_PARAMETERS']
      } else {
        process.env['GIT_CONFIG_PARAMETERS'] = savedGitConfigParams
      }
    })

    // Bare repo defaults to 'master' — clone must use defaultBranch to get 'trunk'
    const source = await createEmptyBareRepository(t)

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source, clonePath, { defaultBranch: 'trunk' })

    assert.equal(existsSync(path.join(clonePath, '.git')), true)

    const result = await exec(['symbolic-ref', 'HEAD'], clonePath)
    assert.equal(result.stdout.trim(), 'refs/heads/trunk')
  })

  it('rejects cloning into ~/.ssh', async () => {
    const os = await import('os')
    const sshPath = path.join(os.homedir(), '.ssh', 'malicious-clone')

    await assert.rejects(
      () => clone('https://example.com/repo.git', sshPath, {}),
      (err: Error) => {
        assert(
          err.message.includes('sensitive system location'),
          `Expected sensitive location error, got: ${err.message}`
        )
        return true
      }
    )
  })

  it('rejects cloning into home directory root', async () => {
    const os = await import('os')
    const homePath = os.homedir()

    await assert.rejects(
      () => clone('https://example.com/repo.git', homePath, {}),
      (err: Error) => {
        assert(
          err.message.includes('sensitive system location'),
          `Expected sensitive location error, got: ${err.message}`
        )
        return true
      }
    )
  })

  it('rejects cloning into ~/.config/git', async () => {
    const os = await import('os')
    const gitConfigPath = path.join(os.homedir(), '.config', 'git')

    await assert.rejects(
      () => clone('https://example.com/repo.git', gitConfigPath, {}),
      (err: Error) => {
        assert(
          err.message.includes('sensitive system location'),
          `Expected sensitive location error, got: ${err.message}`
        )
        return true
      }
    )
  })
})
