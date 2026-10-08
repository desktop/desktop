import assert from 'node:assert'
import { describe, it } from 'node:test'
import { realpath, symlink } from 'fs/promises'
import { join, parse, resolve } from 'path'
import { git } from '../../../src/lib/git/core'
import {
  acquireAssistedCommitGitLease,
  assertRepositoryGitAvailable,
  assertRepositoryGitDestructionAvailable,
  getAssistedCommitProtectedPaths,
  getRepositoryGitOperationPath,
  getRepositoryGitReadEnvironment,
  isReadOnlyGitCommand,
  isRepositoryAffectedByAssistedCommit,
  isRepositoryGitPaused,
  protectAssistedCommitResources,
  repositoryPathsOverlap,
  withoutRepositoryGitAccess,
  withRepositoryGitDestruction,
  withRepositoryGitOperation,
} from '../../../src/lib/git/repository-operation'
import { AssistedCommitError } from '../../../src/lib/git/assisted-commit'
import { optionalBytes, rawGit, seed, tip } from '../../helpers/assisted-commit'
import { deferred } from '../../helpers/copilot-assisted-commit'
import { createTempDirectory } from '../../helpers/temp'
import { Repository } from '../../../src/models/repository'

describe('assisted repository Git coordination', () => {
  it('drains the complete in-flight operation before capture, including later commands', async t => {
    const repository = await seed(t, { 'file.txt': 'before\n' })
    const firstCommand = deferred<void>()
    const continueOperation = deferred<void>()
    const operation = withRepositoryGitOperation(
      repository.path,
      'mutation',
      async () => {
        await git(['rev-parse', 'HEAD'], repository.path, 'first')
        firstCommand.resolve()
        await continueOperation.promise
        await git(['update-index', '--refresh'], repository.path, 'second')
      }
    )
    await firstCommand.promise
    let acquired = false
    const acquiring = acquireAssistedCommitGitLease(repository.path).then(
      lease => {
        acquired = true
        return lease
      }
    )
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(acquired, false)
    assert.strictEqual(isRepositoryGitPaused(repository.path), true)
    await assert.rejects(
      withRepositoryGitOperation(repository.path, 'mutation', async () => {}),
      error => error instanceof AssistedCommitError && error.code === 'busy'
    )
    continueOperation.resolve()
    await operation
    const lease = await acquiring
    t.after(() => lease.release())
    assert.strictEqual(acquired, true)
    await lease.run(async () => {
      await git(['rev-parse', 'HEAD'], repository.path, 'capture')
    })
  })

  it('defers index-refreshing readers and rejects mutations without queueing them', async t => {
    const repository = await seed(t, { 'file.txt': 'before\n' })
    const originalHead = await tip(repository)
    const lease = await acquireAssistedCommitGitLease(repository.path)
    t.after(() => lease.release())
    let started = false
    const status = git(
      ['status', '--porcelain'],
      repository.path,
      'status-reader',
      {
        processCallback: () => {
          started = true
        },
      }
    )
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(started, false)
    await assert.rejects(
      git(
        ['commit', '--allow-empty', '-m', 'Must not run'],
        repository.path,
        'competing-commit'
      ),
      error => error instanceof AssistedCommitError && error.code === 'busy'
    )
    assert.throws(
      () => assertRepositoryGitAvailable(repository.path),
      /assisted commit run/
    )
    lease.release()
    await status
    assert.strictEqual(started, true)
    assert.strictEqual(await tip(repository), originalHead)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
  })

  it('keeps deferred readers registered if another run starts when the first releases', async t => {
    const repository = await seed(t, { 'file.txt': 'before\n' })
    const first = await acquireAssistedCommitGitLease(repository.path)
    const readStarted = deferred<void>()
    const finishRead = deferred<void>()
    const reader = withRepositoryGitOperation(
      repository.path,
      'read',
      async () => {
        readStarted.resolve()
        await finishRead.promise
        await git(['status', '--porcelain'], repository.path, 'deferred-status')
      }
    )
    await new Promise(resolve => setImmediate(resolve))
    first.release()
    await readStarted.promise
    let secondAcquired = false
    const second = acquireAssistedCommitGitLease(repository.path).then(
      lease => {
        secondAcquired = true
        return lease
      }
    )
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(secondAcquired, false)
    finishRead.resolve()
    await reader
    const lease = await second
    lease.release()
  })

  it('does not grant observers ownership, and scopes read-only refresh without global environment changes', async t => {
    const repository = await seed(t, { 'file.txt': 'before\n' })
    const environment = process.env.GIT_OPTIONAL_LOCKS
    const lease = await acquireAssistedCommitGitLease(repository.path)
    t.after(() => lease.release())
    await lease.run(async () => {
      assert.strictEqual(isRepositoryGitPaused(repository.path), false)
      assert.deepStrictEqual(getRepositoryGitReadEnvironment(), {
        GIT_OPTIONAL_LOCKS: '0',
      })
      await withoutRepositoryGitAccess(async () => {
        assert.strictEqual(isRepositoryGitPaused(repository.path), true)
        assert.strictEqual(getRepositoryGitReadEnvironment(), undefined)
        await assert.rejects(
          git(['reset', '--hard'], repository.path, 'observer-write'),
          error => error instanceof AssistedCommitError && error.code === 'busy'
        )
      })
    }, true)
    assert.strictEqual(process.env.GIT_OPTIONAL_LOCKS, environment)
    lease.release()
    assert.strictEqual(getRepositoryGitReadEnvironment(), undefined)
  })

  it('serializes aliases but lets unrelated repositories work independently', async t => {
    const repository = await seed(t, { 'file.txt': 'before\n' })
    const other = await seed(t, { 'file.txt': 'other\n' })
    const directory = await createTempDirectory(t)
    const alias = join(directory, 'alias')
    await symlink(repository.path, alias, __WIN32__ ? 'junction' : 'dir')
    const lease = await acquireAssistedCommitGitLease(repository.path)
    t.after(() => lease.release())
    await assert.rejects(acquireAssistedCommitGitLease(alias), /already owns/)
    await assert.rejects(
      git(['commit', '--allow-empty', '-m', 'Alias'], alias, 'alias-write'),
      error => error instanceof AssistedCommitError && error.code === 'busy'
    )
    await git(
      ['commit', '--allow-empty', '-m', 'Independent'],
      other.path,
      'independent'
    )
  })

  it('allows resource-owner reentry but never lends destructive ownership to observers', async t => {
    const directory = await createTempDirectory(t)
    await withRepositoryGitDestruction(directory, async () => {
      await withRepositoryGitDestruction(directory, async () => {})
      await assert.rejects(
        withoutRepositoryGitAccess(() =>
          withRepositoryGitDestruction(directory, async () => {})
        ),
        /already being removed/
      )
    })
  })

  it('revokes delayed destructive access when its original operation finishes', async t => {
    const directory = await createTempDirectory(t)
    const resume = deferred<void>()
    let late: Promise<void> | undefined
    let entered = false
    await withRepositoryGitDestruction(directory, async () => {
      late = (async () => {
        await resume.promise
        await withRepositoryGitDestruction(directory, async () => {
          entered = true
        })
      })()
    })
    const protection = protectAssistedCommitResources(directory, [
      directory,
      await realpath(directory),
    ])
    t.after(() => protection.release())
    assert.ok(late !== undefined)
    const outcome = late.then(
      () => undefined,
      error => error
    )
    resume.resolve()
    assert.ok((await outcome) instanceof AssistedCommitError)
    assert.strictEqual(entered, false)
  })

  it('protects descendants of a native filesystem root without touching that root', async t => {
    const directory = await createTempDirectory(t)
    const root = parse(directory).root
    const child = join(root, 'assisted-virtual-root-child')
    const protection = protectAssistedCommitResources(root, [root])
    try {
      assert.strictEqual(repositoryPathsOverlap(root, child), true)
      assert.strictEqual(isRepositoryAffectedByAssistedCommit(child), true)
      assert.throws(
        () => assertRepositoryGitDestructionAvailable(child),
        /assisted commit run/
      )
    } finally {
      protection.release()
    }
  })

  it('protects transitive native alternate object stores from removal', async t => {
    const source = await seed(t, { file: 'borrowed history\n' })
    const root = await createTempDirectory(t)
    const firstPath = join(root, 'first-shared-clone')
    await rawGit(source, ['clone', '--shared', '--', source.path, firstPath])
    const first = new Repository(firstPath, -1, null, false)
    const secondPath = join(root, 'second-shared-clone')
    await rawGit(first, ['clone', '--shared', '--', first.path, secondPath])
    const paths = await getAssistedCommitProtectedPaths(secondPath)
    const protection = protectAssistedCommitResources(secondPath, paths)
    t.after(() => protection.release())
    const sourcePath = await realpath(source.path)
    assert.throws(
      () => assertRepositoryGitDestructionAvailable(sourcePath),
      /assisted commit run/
    )
    await assert.rejects(
      withRepositoryGitDestruction(source.path, async () => {}),
      /assisted commit run/
    )
    const alias = join(root, 'source-alias')
    await symlink(source.path, alias, __WIN32__ ? 'junction' : 'dir')
    await assert.rejects(
      withRepositoryGitOperation(alias, 'mutation', async () => {}),
      /assisted commit run/
    )
  })

  it('protects environment-provided alternates without changing their configuration', async t => {
    const source = await seed(t, { file: 'alternate history\n' })
    const repository = await seed(t, { file: 'local history\n' })
    const objects = await rawGit(source, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'objects',
    ])
    const alias = join(
      await createTempDirectory(t),
      __WIN32__ ? 'unicode \u00e5 with space' : 'unicode \u00e5\twith quote"'
    )
    await symlink(objects, alias, __WIN32__ ? 'junction' : 'dir')
    const alternate = JSON.stringify(alias)
    const previous = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
    process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = alternate
    t.after(() => {
      if (previous === undefined) {
        delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
      } else {
        process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = previous
      }
    })
    const paths = await getAssistedCommitProtectedPaths(repository.path)
    const protection = protectAssistedCommitResources(repository.path, paths)
    t.after(() => protection.release())
    const sourcePath = await realpath(source.path)
    assert.throws(
      () => assertRepositoryGitDestructionAvailable(sourcePath),
      /assisted commit run/
    )
    assert.strictEqual(process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES, alternate)
  })

  for (const value of ['--get', '--list', '--get-all']) {
    it(`rejects a native global configuration write with literal value ${value} under protection`, async t => {
      const repository = await seed(t, { file: 'synthetic\n' })
      const config = join(
        await createTempDirectory(t),
        'synthetic-global-config'
      )
      const protection = protectAssistedCommitResources(repository.path, [
        repository.path,
        await realpath(repository.path),
      ])
      t.after(() => protection.release())
      await assert.rejects(
        git(
          ['config', '--global', 'user.name', '--', value],
          repository.path,
          'protectedSyntheticGlobalConfiguration',
          { env: { GIT_CONFIG_GLOBAL: config } }
        ),
        /assisted commit run/
      )
      assert.strictEqual(await optionalBytes(config), null)
    })
  }

  it('classifies configuration and remote writes conservatively', async () => {
    for (const args of [
      ['-c', 'color.ui=false', 'status', '--porcelain'],
      ['config', '--get', 'user.name'],
      ['config', '-z', 'user.email'],
      ['config', '-z', '--local', '--type', 'bool', 'commit.gpgsign'],
      ['config', '--null', '--list', '--includes'],
      ['config', '--file', '--global', '--get', 'user.name'],
      ['remote', '-v'],
      ['remote', 'get-url', 'origin'],
      ['symbolic-ref', '--quiet', 'HEAD'],
      ['interpret-trailers', '--trailer', 'Co-Authored-By=Name <email>'],
      ['worktree', 'list', '--porcelain', '-z'],
      ['count-objects', '-v'],
    ]) {
      assert.strictEqual(isReadOnlyGitCommand(args), true, args.join(' '))
    }
    for (const args of [
      ['config', 'user.name', 'Different'],
      ['config', '--global', 'user.name', '--', '--value'],
      ['config', '--global', 'user.name', '--', '--get'],
      ['config', '--local', 'user.name', '--', '--list'],
      ['config', '--file', '--global', 'user.name', '--', '--get'],
      ['config', '--get', '--add', 'user.name', 'Different'],
      ['remote', '-v', 'add', 'origin', 'https://example.invalid'],
      ['symbolic-ref', 'HEAD', 'refs/heads/other'],
      ['symbolic-ref', '--delete', 'HEAD'],
      ['interpret-trailers', '--in-place', 'file'],
      ['checkout', 'other'],
      ['unknown-command'],
      ['worktree', 'remove', 'path'],
    ]) {
      assert.strictEqual(isReadOnlyGitCommand(args), false, args.join(' '))
    }
  })

  it('derives clone admission from its native explicit destination without changing other command ownership', async () => {
    const directory = resolve('application-command-cwd')
    assert.strictEqual(
      getRepositoryGitOperationPath(
        [
          '-c',
          'init.defaultBranch=main',
          'clone',
          '--recursive',
          '--',
          'source',
          '../destination',
        ],
        directory
      ),
      resolve(directory, '../destination')
    )
    assert.strictEqual(
      getRepositoryGitOperationPath(
        ['config', '--global', '--get', 'init.defaultBranch'],
        directory
      ),
      undefined
    )
    for (const args of [
      ['-c', 'key=clone', 'checkout', '--', 'source', '../destination'],
      ['config', 'clone', '--', 'source', '../destination'],
      ['clone', 'implicit-destination-source'],
      ['config', '--global', '--add', 'key', 'value'],
      ['config', '--global', 'user.name', '--', '--value'],
      ['config', '--global', 'user.name', '--', '--get'],
      ['config', '--file', '--global', '--get', 'user.name'],
    ]) {
      assert.strictEqual(
        getRepositoryGitOperationPath(args, directory),
        directory
      )
    }
  })
})
