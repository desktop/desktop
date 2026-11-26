import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as Path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { shell } from '../../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
  PathspecMagicFileName,
  setupConflictedRepoWithPathspecMagicFile,
  setupRepositoryWithPathspecMagicFile,
  setupRepositoryWithUninitializedSubmodule,
} from '../../helpers/repositories'

import { Repository } from '../../../src/models/repository'
import {
  checkoutBranch,
  checkoutConflictedFile,
  checkoutPaths,
  getBranches,
  createBranch,
  git,
} from '../../../src/lib/git'
import { TipState, IValidBranch } from '../../../src/models/tip'
import { GitStore } from '../../../src/lib/stores'
import { Branch, BranchType } from '../../../src/models/branch'
import { getStatusOrThrow } from '../../helpers/status'
import { exec } from 'dugite'
import { TestStatsStore } from '../../helpers/test-stats-store'
import { pathExists } from '../../../src/lib/path-exists'
import { removeConflictedFile } from '../../../src/lib/git/rm'
import { ManualConflictResolution } from '../../../src/models/manual-conflict-resolution'
import {
  cloneRepository,
  makeCommit,
} from '../../helpers/repository-scaffolding'
import { getBranchOrError, getTipOrError } from '../../helpers/git'

describe('git/checkout', () => {
  it(
    'checks out only the requested path when its name contains pathspec magic',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await setupRepositoryWithPathspecMagicFile(t)
      const specialFilePath = Path.join(repository.path, PathspecMagicFileName)
      const unrelatedFilePath = Path.join(repository.path, 'unrelated.txt')

      await writeFile(specialFilePath, 'modified special content\n')
      await writeFile(unrelatedFilePath, 'modified unrelated content\n')

      await checkoutPaths(repository, [PathspecMagicFileName])

      assert.equal(await readFile(specialFilePath, 'utf8'), 'base content\n')
      assert.equal(
        await readFile(unrelatedFilePath, 'utf8'),
        'modified unrelated content\n'
      )
    }
  )

  it(
    'checks out only the conflicted path when its name contains pathspec magic',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await setupConflictedRepoWithPathspecMagicFile(t, true)
      const file = (
        await getStatusOrThrow(repository)
      ).workingDirectory.files.find(file => file.path === PathspecMagicFileName)
      if (file == null) {
        throw new Error('Expected the pathspec-magic file to be conflicted')
      }

      await checkoutConflictedFile(
        repository,
        file,
        ManualConflictResolution.ours
      )

      assert.equal(
        await readFile(
          Path.join(repository.path, PathspecMagicFileName),
          'utf8'
        ),
        'other content\n'
      )
      assert.match(
        await readFile(Path.join(repository.path, 'unrelated.txt'), 'utf8'),
        /<<<<<<< HEAD/
      )
    }
  )

  it(
    'removes only the conflicted path when its name contains pathspec magic',
    { skip: process.platform === 'win32' },
    async t => {
      const repository = await setupConflictedRepoWithPathspecMagicFile(t)
      const file = (
        await getStatusOrThrow(repository)
      ).workingDirectory.files.find(file => file.path === PathspecMagicFileName)
      assert.ok(file, 'Expected the pathspec-magic file to be conflicted')

      await removeConflictedFile(repository, file)

      assert.equal(
        await pathExists(Path.join(repository.path, PathspecMagicFileName)),
        false
      )
      assert.equal(
        await readFile(Path.join(repository.path, 'unrelated.txt'), 'utf8'),
        'unrelated content\n'
      )
    }
  )

  it('throws when invalid characters are used for branch name', async t => {
    const repository = await setupEmptyRepository(t)

    const branch: Branch = {
      name: '..',
      nameWithoutRemote: '..',
      upstream: null,
      upstreamWithoutRemote: null,
      type: BranchType.Local,
      tip: { sha: '' },
      remoteName: null,
      upstreamRemoteName: null,
      isDesktopForkRemoteBranch: false,
      ref: '',
    }

    await assert.rejects(
      checkoutBranch(repository, branch, null),
      /fatal: invalid reference: ..\n/
    )
  })

  it('can checkout a valid branch name in an existing repository', async t => {
    const path = await setupFixtureRepository(t, 'repo-with-many-refs')
    const repository = new Repository(path, -1, null, false)

    const branches = await getBranches(
      repository,
      'refs/heads/commit-with-long-description'
    )

    if (branches.length === 0) {
      throw new Error(`Could not find branch: commit-with-long-description`)
    }

    await checkoutBranch(repository, branches[0], null)

    const store = new GitStore(repository, shell, new TestStatsStore())
    await store.loadStatus()
    const tip = store.tip

    assert.equal(tip.kind, TipState.Valid)

    const validBranch = tip as IValidBranch
    assert.equal(validBranch.branch.name, 'commit-with-long-description')
  })

  for (const withProgress of [false, true]) {
    for (const name of ['--force', '--orphan=unexpected', '--detach']) {
      it(`checks out local branch ${name} literally with progress ${withProgress}`, async t => {
        const source = await setupEmptyRepository(t)
        await makeCommit(source, {
          entries: [{ path: 'tracked.txt', contents: 'committed\n' }],
        })
        const ref = `refs/heads/${name}`
        await git(['update-ref', ref, 'HEAD'], source.path, 'create test ref')
        await git(
          ['symbolic-ref', 'HEAD', ref],
          source.path,
          'set test default branch'
        )

        const repository = await cloneRepository(t, source)
        const branch = await getBranchOrError(repository, name)
        await git(
          ['checkout', '-b', 'master', 'refs/remotes/origin/master', '--'],
          repository.path,
          'switch away from test default branch'
        )
        const filePath = Path.join(repository.path, 'tracked.txt')
        await writeFile(filePath, 'uncommitted\n')

        await checkoutBranch(
          repository,
          branch,
          null,
          withProgress
            ? progress => assert.strictEqual(progress.kind, 'checkout')
            : undefined
        )

        assert.strictEqual(await readFile(filePath, 'utf8'), 'uncommitted\n')
        const head = await git(
          ['symbolic-ref', 'HEAD'],
          repository.path,
          'read checked out branch'
        )
        assert.strictEqual(head.stdout.trim(), ref)
        assert.strictEqual(
          (await getTipOrError(repository)).sha,
          branch.tip.sha
        )
      })
    }

    it(`preserves remote checkout and tracking with progress ${withProgress}`, async t => {
      const source = await setupEmptyRepository(t)
      await makeCommit(source, {
        entries: [{ path: 'tracked.txt', contents: 'base\n' }],
      })
      const repository = await cloneRepository(t, source)
      await git(
        ['checkout', '-b', 'topic'],
        source.path,
        'create test remote branch'
      )
      await makeCommit(source, {
        entries: [{ path: 'tracked.txt', contents: 'remote branch\n' }],
      })
      await git(
        ['fetch', 'origin'],
        repository.path,
        'fetch test remote branch'
      )
      const [branch] = await getBranches(
        repository,
        'refs/remotes/origin/topic'
      )
      assert.ok(branch !== undefined)
      assert.strictEqual(branch.type, BranchType.Remote)

      await checkoutBranch(
        repository,
        branch,
        null,
        withProgress
          ? progress => assert.strictEqual(progress.kind, 'checkout')
          : undefined
      )

      const head = await git(
        ['symbolic-ref', 'HEAD'],
        repository.path,
        'read checked out branch'
      )
      assert.strictEqual(head.stdout.trim(), 'refs/heads/topic')
      assert.strictEqual((await getTipOrError(repository)).sha, branch.tip.sha)
      const upstream = await git(
        ['rev-parse', '--symbolic-full-name', '@{upstream}'],
        repository.path,
        'read checked out upstream'
      )
      assert.strictEqual(upstream.stdout.trim(), branch.ref)
      assert.strictEqual(
        (
          await readFile(Path.join(repository.path, 'tracked.txt'), 'utf8')
        ).replace(/\r\n/g, '\n'),
        'remote branch\n'
      )
    })
  }

  it('can checkout a branch when it exists on multiple remotes', async t => {
    const path = await setupFixtureRepository(t, 'checkout-test-cases')
    const repository = new Repository(path, -1, null, false)

    const expectedBranch = 'first'
    const firstRemote = 'first-remote'
    const secondRemote = 'second-remote'

    const branches = await getBranches(repository)
    const firstBranch = `${firstRemote}/${expectedBranch}`
    const firstRemoteBranch = branches.find(b => b.name === firstBranch)

    if (firstRemoteBranch == null) {
      throw new Error(`Could not find branch: '${firstBranch}'`)
    }

    const secondBranch = `${secondRemote}/${expectedBranch}`
    const secondRemoteBranch = branches.find(b => b.name === secondBranch)

    if (secondRemoteBranch == null) {
      throw new Error(`Could not find branch: '${secondBranch}'`)
    }

    await checkoutBranch(repository, firstRemoteBranch, null)

    const store = new GitStore(repository, shell, new TestStatsStore())
    await store.loadStatus()
    const tip = store.tip

    assert.equal(tip.kind, TipState.Valid)

    const validBranch = tip as IValidBranch
    assert.equal(validBranch.branch.name, expectedBranch)
    assert.equal(validBranch.branch.type, BranchType.Local)
    assert.equal(validBranch.branch.upstreamRemoteName, 'first-remote')
  })

  it('will fail when an existing branch matches the remote branch', async t => {
    const path = await setupFixtureRepository(t, 'checkout-test-cases')
    const repository = new Repository(path, -1, null, false)

    const expectedBranch = 'first'
    const firstRemote = 'first-remote'

    const branches = await getBranches(repository)
    const firstBranch = `${firstRemote}/${expectedBranch}`
    const remoteBranch = branches.find(b => b.name === firstBranch)

    if (remoteBranch == null) {
      throw new Error(`Could not find branch: '${firstBranch}'`)
    }

    await createBranch(repository, expectedBranch, null)

    await assert.rejects(
      checkoutBranch(repository, remoteBranch, null),
      /A branch with that name already exists./
    )
  })

  describe('with submodules', () => {
    it('updates a changed submodule reference', async t => {
      const path = await setupFixtureRepository(t, 'test-submodule-checkouts')
      const repository = new Repository(path, -1, null, false)

      // put the repository into a known good state
      await exec(['checkout', 'master', '-f', '--recurse-submodules'], path)

      const branches = await getBranches(repository)
      const devBranch = branches.find(b => b.name === 'dev')

      if (devBranch == null) {
        throw new Error(`Could not find branch: 'dev'`)
      }

      await checkoutBranch(repository, devBranch, null)

      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 0)
    })

    it('initializes an uninitialized submodule when checking out a branch', async t => {
      const repository = await setupRepositoryWithUninitializedSubmodule(t)

      const branches = await getBranches(repository)
      const branchWithSubmodule = branches.find(b => b.name !== 'master')

      if (branchWithSubmodule == null) {
        throw new Error(`Could not find branch other than 'master'`)
      }

      await checkoutBranch(
        repository,
        branchWithSubmodule,
        null,
        undefined,
        true
      )

      // Verify we're on the correct branch
      const statusOutput = await exec(['status'], repository.path)
      assert.ok(
        statusOutput.stdout.includes(`On branch ${branchWithSubmodule.name}`)
      )

      // Verify the submodule is initialized and has the correct commits
      const submodulePath = Path.join(repository.path, 'test-submodule')
      const submoduleGitPath = Path.join(submodulePath, '.git')

      // Check that submodule .git exists (either as file or directory)
      const submoduleGitExists = await pathExists(submoduleGitPath)
      assert.equal(
        submoduleGitExists,
        true,
        'Submodule .git should exist after checkout'
      )

      // Verify submodule has two commits
      const submoduleLog = await exec(['log', '--oneline'], submodulePath)
      assert.equal(submoduleLog.stdout.trim().split('\n').length, 2)
    })
  })
})
