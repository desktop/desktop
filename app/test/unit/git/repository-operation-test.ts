import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { TipState } from '../../../src/models/tip'
import { ipcRenderer } from 'electron'
import { UncommittedChangesStrategy } from '../../../src/models/uncommitted-changes-strategy'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { realpath, symlink, writeFile, mkdir, rename } from 'fs/promises'
import { join, parse, resolve, relative } from 'path'
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
  hasRepositoryGitOperationAccess,
} from '../../../src/lib/git/repository-operation'
import { AssistedCommitError } from '../../../src/lib/git/assisted-commit'
import {
  optionalBytes,
  rawGit,
  seed,
  tip,
  count,
} from '../../helpers/assisted-commit'
import {
  deferred,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
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

describe('AppStore assisted repository operation admission', () => {
  it('terminal chunks, GitStore updates and AppStore errors never grant observer mutation access', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const lease = await acquireAssistedCommitGitLease(repository.path)
    t.after(() => lease.release())
    const access: boolean[] = []
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const update = gitStore.onDidUpdate(() =>
      access.push(hasRepositoryGitOperationAccess(repository.path))
    )
    const error = h.appStore.onDidError(() =>
      access.push(hasRepositoryGitOperationAccess(repository.path))
    )
    t.after(() => {
      update.dispose()
      error.dispose()
    })
    await lease.run(async () => {
      await git(['rev-parse', 'HEAD'], repository.path, 'terminal-observer', {
        onTerminalOutputAvailable: subscribe => {
          subscribe(() =>
            access.push(hasRepositoryGitOperationAccess(repository.path))
          )
        },
      })
      gitStore['emitUpdate']()
      h.appStore['emitError'](new Error('Synthetic observer error'))
    })
    assert.ok(access.length >= 3)
    assert.ok(
      access.every(value => value === false),
      JSON.stringify(access)
    )
  })

  for (const operation of ['delete', 'move'] as const) {
    it(`guards the ${operation} target worktree even when invoked through another repository`, async t => {
      const source = await seed(t, { file: 'source\n' })
      const target = await seed(t, { file: 'target\n' })
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const lease = await acquireAssistedCommitGitLease(target.path)
      t.after(() => lease.release())
      let entered = false
      h.appStore['deleteWorktreeCore'] = async () => {
        entered = true
      }
      h.appStore['moveWorktreeCore'] = async () => {
        entered = true
      }
      await assert.rejects(
        operation === 'delete'
          ? h.appStore._deleteWorktree(repository, target.path, { force: true })
          : h.appStore._moveWorktree(
              repository,
              target.path,
              `${target.path}-moved`
            ),
        /assisted commit run/
      )
      assert.strictEqual(entered, false)
    })
  }

  it('cannot remove shared main Git metadata while a linked worktree run owns it', async t => {
    const source = await seed(t, { file: 'before\n' })
    const linked = await createTempDirectory(t)
    await rawGit(source, ['worktree', 'add', '-b', 'linked', linked])
    await writeFile(join(linked, 'file'), 'linked selection\n')
    const h = await createAssistedCommitRunHarness(t)
    const main = await h.register(source)
    const target = await h.register(new Repository(linked, -1, null, false))
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      target,
      h.request(target)
    )
    await analyzing.promise
    let removed = false
    h.appStore['removeRepositoryCore'] = async () => {
      removed = true
    }
    try {
      await assert.rejects(
        h.appStore._removeRepository(main, true),
        /assisted commit run/
      )
      assert.strictEqual(removed, false)
    } finally {
      h.cancel(target)
      finish.resolve()
      await operation
    }
  })

  for (const mutation of ['delete', 'move', 'discard'] as const) {
    it(`rejects ${mutation} of an ancestor containing a protected active descendant`, async t => {
      const main = await seed(t, { file: 'main\n' })
      const ancestor = join(main.path, 'nested')
      await mkdir(ancestor)
      const child = await seed(t, { file: 'child\n' })
      const childPath = join(ancestor, 'nested-repository')
      await rename(child.path, childPath)
      await mkdir(child.path)
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(main)
      const protectedPaths = [childPath]
      const lease = await acquireAssistedCommitGitLease(
        childPath,
        protectedPaths
      )
      t.after(() => lease.release())
      let entered = false
      h.appStore['deleteWorktreeCore'] = async () => {
        entered = true
      }
      h.appStore['moveWorktreeCore'] = async () => {
        entered = true
      }
      h.appStore['discardChangesCore'] = async () => {
        entered = true
      }
      const targetRelative = relative(repository.path, ancestor)
      const operation =
        mutation === 'delete'
          ? h.appStore._deleteWorktree(repository, ancestor, { force: true })
          : mutation === 'move'
          ? h.appStore._moveWorktree(repository, ancestor, `${ancestor}-moved`)
          : h.appStore._discardChanges(
              repository,
              [
                new WorkingDirectoryFileChange(
                  targetRelative,
                  { kind: AppFileStatusKind.Untracked },
                  DiffSelection.fromInitialSelection(DiffSelectionType.All)
                ),
              ],
              true
            )
      await assert.rejects(operation, /assisted commit run/)
      assert.strictEqual(entered, false)
    })
  }

  it('guards a file inside a protected working directory, not only its ancestor root', async t => {
    const source = await seed(t, { file: 'before\n' })
    const nested = await seed(t, { file: 'nested\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const lease = await acquireAssistedCommitGitLease(nested.path)
    t.after(() => lease.release())
    let entered = false
    h.appStore['discardChangesCore'] = async () => {
      entered = true
    }
    const file = new WorkingDirectoryFileChange(
      relative(repository.path, join(nested.path, 'file')),
      { kind: AppFileStatusKind.Modified },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    await assert.rejects(
      h.appStore._discardChanges(repository, [file], false),
      /assisted commit run/
    )
    assert.strictEqual(entered, false)
  })

  it('blocks parent checkout while a descendant repository owns selected working bytes', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const nested = join(source.path, 'nested')
    await mkdir(nested)
    const lease = await acquireAssistedCommitGitLease(nested)
    t.after(() => lease.release())
    const branch = h.state(repository).branchesState.tip
    assert.ok(branch.kind === TipState.Valid)
    let entered = false
    h.appStore['checkoutBranchCore'] = async () => {
      entered = true
      return repository
    }
    await assert.rejects(
      h.appStore._checkoutBranch(repository, branch.branch),
      /assisted commit run/
    )
    assert.strictEqual(entered, false)
  })

  it('blocks active branch rename through a peer linked worktree with the same common metadata', async t => {
    const main = await seed(t, { file: 'before\n' })
    const bPath = await createTempDirectory(t)
    const cPath = await createTempDirectory(t)
    await rawGit(main, ['worktree', 'add', '-b', 'run-branch', bPath])
    await rawGit(main, ['worktree', 'add', '-b', 'peer-branch', cPath])
    await writeFile(join(bPath, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const b = await h.register(new Repository(bPath, -1, null, false))
    const c = await h.register(new Repository(cPath, -1, null, false))
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(b, h.request(b))
    await analyzing.promise
    const tip = h.state(b).branchesState.tip
    assert.ok(tip.kind === TipState.Valid)
    let entered = false
    h.appStore['renameBranchCore'] = async () => {
      entered = true
    }
    try {
      await assert.rejects(
        h.appStore._renameBranch(c, tip.branch, 'renamed-run'),
        /assisted commit run/
      )
      assert.strictEqual(entered, false)
    } finally {
      h.cancel(b)
      finish.resolve()
      await operation
    }
  })

  it('does not retain mutation protection for a settled nonretry planning error', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Settled planning failure')
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    let entered = false
    h.appStore['discardChangesCore'] = async () => {
      entered = true
    }
    await h.appStore._discardChanges(
      repository,
      h.request(repository).files,
      false
    )
    assert.strictEqual(entered, true)
  })

  it('allows ordinary compound create-and-checkout in a linked worktree', async t => {
    const main = await seed(t, { file: 'before\n' })
    const linked = await createTempDirectory(t)
    await rawGit(main, ['worktree', 'add', '-b', 'linked', linked])
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(new Repository(linked, -1, null, false))
    await h.appStore._createBranch(repository, 'created-in-linked', 'HEAD')
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', '--short', 'HEAD']),
      'created-in-linked'
    )
  })

  it('opens Locate for a vanished repository without querying the missing Git directory', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const moved = join(await createTempDirectory(t), 'moved')
    await rename(repository.path, moved)
    const dialog = t.mock.method(ipcRenderer, 'invoke', async () => null)
    try {
      await h.appStore._relocateRepository(repository)
      assert.strictEqual(dialog.mock.callCount(), 1)
      assert.strictEqual(dialog.mock.calls[0].arguments[0], 'show-open-dialog')
    } finally {
      await rename(moved, repository.path)
    }
  })

  it('never interrupts an earlier native create-and-checkout with preparing admission', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.dialogs['lastConsent'] = null
    h.appStore['uncommittedChangesStrategy'] =
      UncommittedChangesStrategy.MoveToNewBranch
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const create = gitStore.createBranch.bind(gitStore)
    const entered = deferred<void>()
    const finish = deferred<void>()
    gitStore.createBranch = async (...args) => {
      const result = await create(...args)
      entered.resolve()
      await finish.promise
      return result
    }
    const ordinary = h.appStore
      ._createBranch(repository, 'earlier-branch', 'HEAD')
      .then(
        result => ({ result }),
        error => ({ error })
      )
    await entered.promise
    const assisted = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await new Promise(resolve => setTimeout(resolve, 150))
    finish.resolve()
    const ordinaryOutcome = await ordinary
    h.cancel(repository)
    const assistedOutcome = await assisted
    assert.ok('result' in ordinaryOutcome)
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', '--short', 'HEAD']),
      'earlier-branch'
    )
    assert.strictEqual(assistedOutcome.kind, 'busy')
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it('allows ordinary manual commits during a background fetch reservation when no assisted run exists', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setCommitMode(repository, 'manual')
    const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(h.appStore)
    let refreshed: Promise<void> | undefined
    h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
      refreshed = refresh(...args)
      return refreshed
    }
    const entered = deferred<void>()
    const finish = deferred<void>()
    const fetch = h.appStore['withPushPullFetch'](repository, async () => {
      entered.resolve()
      await finish.promise
    })
    await entered.promise
    let result: boolean | undefined
    let failure: unknown
    try {
      result = await h.appStore._commitIncludedChanges(repository, {
        summary: 'Ordinary manual commit',
        description: '',
        trailers: [],
      })
    } catch (error) {
      failure = error
    } finally {
      finish.resolve()
      await fetch
      await refreshed
    }
    assert.strictEqual(failure, undefined)
    assert.strictEqual(result, true)
    assert.strictEqual(await count(repository), 2)
  })

  it('rejects a worktree move destination inside protected selected working files', async t => {
    const source = await seed(t, { file: 'before\n' })
    const other = await seed(t, { file: 'other\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(other)
    const lease = await acquireAssistedCommitGitLease(source.path)
    t.after(() => lease.release())
    let entered = false
    h.appStore['moveWorktreeCore'] = async () => {
      entered = true
    }
    await assert.rejects(
      h.appStore._moveWorktree(
        repository,
        other.path,
        join(source.path, 'new-destination')
      ),
      /assisted commit/i
    )
    assert.strictEqual(entered, false)
  })

  it('rejects creating a worktree inside protected selected working files before native add', async t => {
    const source = await seed(t, { file: 'before\n' })
    const other = await seed(t, { file: 'other\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(other)
    const lease = await acquireAssistedCommitGitLease(source.path)
    t.after(() => lease.release())
    await assert.rejects(
      h.appStore._addWorktreeAndSwitch(
        repository,
        join(source.path, 'new-destination'),
        { createBranch: 'must-not-exist' }
      ),
      /assisted commit/i
    )
    assert.strictEqual(
      await rawGit(repository, ['branch', '--list', 'must-not-exist']),
      ''
    )
  })

  it('keeps add/read/switch worktree covered by one admission lifetime', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    t.mock.method(h.appStore, '_selectRepository', async () => {})
    const target = join(await createTempDirectory(t), 'linked')
    const entered = deferred<void>()
    const finish = deferred<void>()
    const switchCore = h.appStore['switchWorktreeCore'].bind(h.appStore)
    h.appStore['switchWorktreeCore'] = async (...args) => {
      entered.resolve()
      await finish.promise
      return switchCore(...args)
    }
    const operation = h.appStore._addWorktreeAndSwitch(repository, target, {
      createBranch: 'whole-operation',
    })
    await entered.promise
    const assisted = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository, { allowEmptyCommit: true })
    )
    finish.resolve()
    await operation
    assert.strictEqual(assisted.kind, 'busy')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    const targetRepo = new Repository(target, -1, null, false)
    assert.strictEqual(
      await rawGit(targetRepo, ['symbolic-ref', '--short', 'HEAD']),
      'whole-operation'
    )
  })

  it('reserves parent-overlapping physical bytes before the first preparing publication', async t => {
    const parentSource = await seed(t, { parent: 'parent\n' })
    const childSource = await seed(t, { file: 'before\n' })
    const childPath = join(parentSource.path, 'nested')
    await rename(childSource.path, childPath)
    await mkdir(childSource.path)
    await writeFile(join(childPath, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const child = await h.register(new Repository(childPath, -1, null, false))
    const parent = await h.register(parentSource)
    const entered = deferred<void>()
    const finish = deferred<void>()
    let observed = false
    let protectedAtPublication = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !observed &&
        h.state(child).changesState.assistedCommit.kind === 'preparing'
      ) {
        observed = true
        protectedAtPublication = isRepositoryAffectedByAssistedCommit(
          parent.path
        )
      }
    })
    t.after(() => subscription.dispose())
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      child,
      h.request(child)
    )
    await entered.promise
    h.cancel(child)
    finish.resolve()
    await operation
    assert.strictEqual(protectedAtPublication, true)
  })
})
