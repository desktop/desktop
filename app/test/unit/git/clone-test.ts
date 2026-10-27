import { afterEach, beforeEach, describe, it, TestContext } from 'node:test'
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
import { realpath, symlink, writeFile } from 'fs/promises'
import {
  acquireAssistedCommitGitLease,
  getAssistedCommitProtectedPaths,
  hasRepositoryGitOperationAccess,
  IAssistedCommitGitLease,
  protectAssistedCommitResources,
  withoutRepositoryGitAccess,
} from '../../../src/lib/git/repository-operation'
import { rollbackAssistedCommitTransaction } from '../../../src/lib/git/assisted-commit'
import { Repository } from '../../../src/models/repository'
import { rawGit, request, single, tip } from '../../helpers/assisted-commit'
import { deferred } from '../../helpers/copilot-assisted-commit'

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

  it('allows an independent clone while the application execution directory is protected', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'Synthetic clone contents' }],
    })
    const destination = path.join(await createTempDirectory(t), 'independent')
    const applicationDirectory = path.resolve(__dirname, '../../../src/lib/git')
    const protection = protectAssistedCommitResources(applicationDirectory, [
      applicationDirectory,
      await realpath(applicationDirectory),
    ])
    t.after(() => protection.release())
    const lease = await acquireAssistedCommitGitLease(applicationDirectory)
    t.after(() => lease.release())
    await clone(source.path, destination, {})
    assert.strictEqual(existsSync(path.join(destination, 'README.md')), true)
    assert.strictEqual(existsSync(path.join(destination, '.git')), true)
  })

  describe('local source coordination', () => {
    async function sourceFixture(t: TestContext, sharedPeer = false) {
      const source = await setupEmptyRepository(t)
      await makeCommit(source, {
        entries: [{ path: 'file.txt', contents: 'before\n' }],
      })
      const original = await tip(source)
      const parent = await createTempDirectory(t)
      const destination = path.join(parent, 'clone')
      let active = source
      if (sharedPeer) {
        const peer = path.join(parent, 'active-peer')
        await rawGit(source, [
          'worktree',
          'add',
          '-b',
          'active-peer',
          '--',
          peer,
        ])
        active = new Repository(peer, -1, null, false)
      }
      return { source, active, original, parent, destination }
    }

    for (const kind of [
      'path',
      'relative-path',
      'symlink-path',
      'git-directory',
      'git-suffix',
      'colon-path',
      'file-url',
      'file-url-authority',
      'file-url-literal',
      'shared-peer-path',
      'shared-peer-file-url',
    ] as const) {
      it(`waits for local source recovery rather than copying transient commits (${kind})`, async t => {
        const sharedPeer = kind.startsWith('shared-peer')
        const { source, active, original, parent, destination } =
          await sourceFixture(t, sharedPeer)
        let url = source.path
        if (
          kind === 'symlink-path' ||
          kind.startsWith('file-url') ||
          kind === 'colon-path'
        ) {
          const alias = path.join(
            parent,
            kind === 'colon-path' && !__WIN32__
              ? 'source:local'
              : 'source space#percent%'
          )
          await symlink(source.path, alias, __WIN32__ ? 'junction' : 'dir')
          url = alias
        }
        if (kind === 'relative-path') {
          url = path.relative(
            path.resolve(__dirname, '../../../src/lib/git'),
            source.path
          )
        } else if (kind === 'git-directory') {
          url = path.join(source.path, '.git')
        } else if (kind === 'git-suffix') {
          url = path.join(parent, 'source-with-suffix')
          await symlink(
            source.path,
            `${url}.git`,
            __WIN32__ ? 'junction' : 'dir'
          )
        } else if (kind.includes('file-url')) {
          url = pathToFileURL(url).href
          if (kind === 'file-url-authority') {
            url = url.replace('file:///', 'file://clone-local/')
          } else if (kind === 'file-url-literal') {
            url = url
              .replaceAll('%20', ' ')
              .replaceAll('%23', '#')
              .replaceAll('%25', '%')
          }
        }
        await writeFile(
          path.join(active.path, 'file.txt'),
          'transient selected content\n'
        )
        const lease = await acquireAssistedCommitGitLease(
          active.path,
          await getAssistedCommitProtectedPaths(active.path)
        )
        t.after(() => lease.release())
        const result = await lease.run(async () =>
          single(active, await request(active))
        )
        assert.notStrictEqual(await tip(active), original)
        const entered = deferred<void>()
        const cloning = clone(url, destination, {}, () => entered.resolve())
        let timeout: ReturnType<typeof setTimeout> | undefined
        const beganBeforeRecovery = await Promise.race([
          entered.promise.then(() => true),
          new Promise<false>(resolve => {
            timeout = setTimeout(() => resolve(false), 200)
          }),
        ])
        if (timeout !== undefined) {
          clearTimeout(timeout)
        }
        try {
          await lease.run(() => rollbackAssistedCommitTransaction(result))
        } finally {
          lease.release()
          await cloning
        }
        assert.strictEqual(
          beganBeforeRecovery,
          false,
          'Clone must not begin reading an active assisted source'
        )
        assert.strictEqual(await tip(active), original)
        const cloned = new Repository(destination, -1, null, false)
        assert.strictEqual(await tip(cloned), original)
        if (sharedPeer) {
          assert.strictEqual(
            await rawGit(cloned, [
              'rev-parse',
              'refs/remotes/origin/active-peer',
            ]),
            original
          )
        }
      })
    }

    for (const sharedPeer of [false, true]) {
      it(`retains its source read through native clone completion (shared peer=${sharedPeer})`, async t => {
        const { source, active, destination } = await sourceFixture(
          t,
          sharedPeer
        )
        const protectedPaths = await getAssistedCommitProtectedPaths(
          active.path
        )
        let acquiring: Promise<IAssistedCommitGitLease> | undefined
        let acquired = false
        const observations: boolean[] = []
        await clone(pathToFileURL(source.path).href, destination, {}, () => {
          if (acquiring === undefined) {
            acquiring = withoutRepositoryGitAccess(() =>
              acquireAssistedCommitGitLease(active.path, protectedPaths)
            ).then(lease => {
              acquired = true
              return lease
            })
          }
          observations.push(acquired)
        })
        assert.ok(acquiring)
        const lease = await acquiring
        lease.release()
        assert.ok(
          observations.length > 1,
          'Real file transport must report native progress'
        )
        assert.ok(
          observations.every(value => value === false),
          'A later lease must drain the complete clone, not just source metadata probes'
        )
        assert.strictEqual(existsSync(path.join(destination, 'file.txt')), true)
      })
    }

    it('does not lend the source read to progress observers', async t => {
      const { source, destination } = await sourceFixture(t)
      const access: boolean[] = []
      await clone(source.path, destination, {}, () => {
        access.push(hasRepositoryGitOperationAccess(source.path))
      })
      assert.ok(access.length > 0)
      assert.ok(access.every(value => value === false))
    })

    it('keeps the destination reserved while waiting for an active source', async t => {
      const { source, destination } = await sourceFixture(t)
      const lease = await acquireAssistedCommitGitLease(source.path)
      t.after(() => lease.release())
      const cloning = clone(source.path, destination, {})
      try {
        await new Promise(resolve => setTimeout(resolve, 200))
        assert.strictEqual(existsSync(destination), false)
        await assert.rejects(
          acquireAssistedCommitGitLease(destination),
          /being removed/
        )
      } finally {
        lease.release()
        await cloning
      }
      assert.strictEqual(existsSync(path.join(destination, '.git')), true)
    })
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
