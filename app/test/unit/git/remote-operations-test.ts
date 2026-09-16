import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { readFile, writeFile } from 'fs/promises'
import * as Path from 'path'

import { git } from '../../../src/lib/git/core'
import { fetch, fetchRefspec } from '../../../src/lib/git/fetch'
import { pull } from '../../../src/lib/git/pull'
import { push } from '../../../src/lib/git/push'
import { getMergeBase, merge, MergeResult } from '../../../src/lib/git/merge'
import { createBranch, deleteRemoteBranch } from '../../../src/lib/git/branch'
import { getBranches } from '../../../src/lib/git/for-each-ref'
import { rebase, RebaseResult } from '../../../src/lib/git/rebase'
import { checkoutBranch } from '../../../src/lib/git/checkout'
import { addWorktree } from '../../../src/lib/git/worktree'
import { fetchTagsToPush, getAllTags } from '../../../src/lib/git/tag'
import { IRemote } from '../../../src/models/remote'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'
import {
  cloneRepository,
  makeCommit,
} from '../../helpers/repository-scaffolding'
import {
  getBranchOrError,
  getRefOrError,
  getTipOrError,
} from '../../helpers/git'

async function setupRemote(t: TestContext, name: string) {
  const upstream = await setupEmptyRepository(t)
  await makeCommit(upstream, {
    entries: [{ path: 'README.md', contents: 'initial' }],
  })

  const repository = await cloneRepository(t, upstream)
  if (name !== 'origin') {
    await git(
      ['config', '--rename-section', 'remote.origin', `remote.${name}`],
      repository.path,
      'rename remote configuration'
    )
    await git(
      ['config', 'branch.master.remote', name],
      repository.path,
      'set upstream remote'
    )
    await git(
      [
        'config',
        `remote.${name}.fetch`,
        `+refs/heads/*:refs/remotes/${name}/*`,
      ],
      repository.path,
      'set remote-tracking namespace'
    )
    await git(
      ['fetch', '--', name],
      repository.path,
      'initialize remote-tracking refs'
    )
  }

  await makeCommit(upstream, {
    entries: [{ path: 'README.md', contents: 'updated' }],
  })

  const remote: IRemote = { name, url: upstream.path }
  return { repository, upstream, remote }
}

describe('git/remote operations', () => {
  for (const remoteName of ['origin', '--remote']) {
    describe(`remote named ${remoteName}`, () => {
      it('discovers unpushed tags without modifying the remote', async t => {
        const { repository, upstream, remote } = await setupRemote(
          t,
          remoteName
        )
        await git(
          ['tag', '-a', '-m', 'Release', 'v1.0'],
          repository.path,
          'create annotated tag'
        )
        await writeFile(
          Path.join(repository.path, '.git', 'hooks', 'pre-push'),
          '#!/bin/sh\nexit 1\n',
          { mode: 0o755 }
        )
        const before = await getTipOrError(upstream)

        assert.deepStrictEqual(
          await fetchTagsToPush(repository, remote, 'master'),
          ['v1.0']
        )

        assert.strictEqual((await getAllTags(upstream)).size, 0)
        assert.strictEqual((await getTipOrError(upstream)).sha, before.sha)
      })

      for (const branchName of [undefined, 'linked-branch']) {
        it(`adds a worktree from a canonical remote ref ${
          branchName ?? 'detached'
        }`, async t => {
          const { repository, upstream, remote } = await setupRemote(
            t,
            remoteName
          )
          await fetch(repository, remote)
          const worktreePath = await createTempDirectory(t)

          await addWorktree(repository, worktreePath, {
            createBranch: branchName,
            commitish: `refs/remotes/${remoteName}/master`,
          })

          const head = await git(
            ['rev-parse', 'HEAD'],
            worktreePath,
            'get worktree commit'
          )
          assert.strictEqual(
            head.stdout.trim(),
            (await getTipOrError(upstream)).sha
          )
          const branch = await git(
            ['symbolic-ref', '--quiet', '--short', 'HEAD'],
            worktreePath,
            'get worktree branch',
            { successExitCodes: new Set([0, 1]) }
          )
          assert.strictEqual(branch.exitCode, branchName === undefined ? 1 : 0)
          assert.strictEqual(branch.stdout.trim(), branchName ?? '')
          if (branchName !== undefined) {
            const tracking = await git(
              ['config', '--get', `branch.${branchName}.remote`],
              worktreePath,
              'get worktree upstream remote'
            )
            assert.strictEqual(tracking.stdout.trim(), remoteName)
          }
          assert.strictEqual(
            await readFile(Path.join(worktreePath, 'README.md'), 'utf8'),
            'updated'
          )
        })
      }

      for (const createNewBranch of [false, true]) {
        it(`adds a worktree for ${
          createNewBranch ? 'a new' : 'an existing local'
        } branch`, async t => {
          const { repository } = await setupRemote(t, remoteName)
          const worktreePath = await createTempDirectory(t)
          const branchName = 'local-worktree'
          const expected = await getTipOrError(repository)

          if (!createNewBranch) {
            await git(
              ['branch', branchName],
              repository.path,
              'create local worktree branch'
            )
          }

          await addWorktree(
            repository,
            worktreePath,
            createNewBranch
              ? { createBranch: branchName }
              : { commitish: branchName }
          )

          const head = await git(
            ['rev-parse', 'HEAD'],
            worktreePath,
            'get worktree commit'
          )
          assert.strictEqual(head.stdout.trim(), expected.sha)
          const branch = await git(
            ['symbolic-ref', '--short', 'HEAD'],
            worktreePath,
            'get worktree branch'
          )
          assert.strictEqual(branch.stdout.trim(), branchName)
          assert.strictEqual(
            await readFile(Path.join(worktreePath, 'README.md'), 'utf8'),
            'initial'
          )
          const tracking = await git(
            ['config', '--get', `branch.${branchName}.remote`],
            worktreePath,
            'check worktree has no upstream',
            { successExitCodes: new Set([0, 1]) }
          )
          assert.strictEqual(tracking.exitCode, 1)
        })
      }

      it('checks out a remote branch and configures upstream tracking', async t => {
        const { repository, upstream, remote } = await setupRemote(
          t,
          remoteName
        )
        await git(['branch', 'topic'], upstream.path, 'create remote branch')
        await git(
          ['config', 'branch.autoSetupMerge', 'true'],
          repository.path,
          'enable automatic upstream tracking'
        )
        await fetch(repository, remote)
        const [branch] = await getBranches(
          repository,
          `refs/remotes/${remoteName}/topic`
        )
        assert(branch !== undefined)

        await checkoutBranch(repository, branch, remote)

        const current = await git(
          ['symbolic-ref', '--short', 'HEAD'],
          repository.path,
          'get checked out branch'
        )
        assert.strictEqual(current.stdout.trim(), 'topic')
        const local = await getBranchOrError(repository, 'topic')
        assert.strictEqual(local.upstream, `${remoteName}/topic`)
        assert.strictEqual(local.tip.sha, branch.tip.sha)
        assert.strictEqual(
          await readFile(Path.join(repository.path, 'README.md'), 'utf8'),
          'updated'
        )
      })

      for (const withProgress of [false, true]) {
        it(`rebases onto a remote ref with progress ${withProgress}`, async t => {
          const { repository, upstream, remote } = await setupRemote(
            t,
            remoteName
          )
          await makeCommit(repository, {
            entries: [{ path: 'local.txt', contents: 'local change' }],
          })
          await fetch(repository, remote)
          const [base] = await getBranches(
            repository,
            `refs/remotes/${remoteName}/master`
          )
          assert(base !== undefined)
          const target = await getBranchOrError(repository, 'master')
          const progress = t.mock.fn()

          assert.strictEqual(
            await rebase(
              repository,
              base,
              target,
              withProgress ? progress : undefined
            ),
            RebaseResult.CompletedWithoutError
          )

          const after = await getTipOrError(repository)
          const expected = await getTipOrError(upstream)
          assert.deepStrictEqual(after.parentSHAs, [expected.sha])
          assert.strictEqual(
            await readFile(Path.join(repository.path, 'local.txt'), 'utf8'),
            'local change'
          )
          assert.strictEqual(progress.mock.callCount() > 0, withProgress)
        })
      }

      for (const squash of [false, true]) {
        it(`merges a remote ref with squash ${squash}`, async t => {
          const { repository, upstream, remote } = await setupRemote(
            t,
            remoteName
          )
          await fetch(repository, remote)
          const before = await getTipOrError(repository)

          assert.strictEqual(
            await merge(repository, `${remoteName}/master`, {
              squash,
              noVerify: true,
            }),
            MergeResult.Success
          )

          const after = await getTipOrError(repository)
          const expected = await getTipOrError(upstream)
          if (squash) {
            assert.deepStrictEqual(after.parentSHAs, [before.sha])
          } else {
            assert.strictEqual(after.sha, expected.sha)
          }
          assert.strictEqual(
            await readFile(Path.join(repository.path, 'README.md'), 'utf8'),
            'updated'
          )
        })
      }

      for (const noTrack of [false, true]) {
        it(`creates a branch from a remote ref with noTrack ${noTrack}`, async t => {
          const { repository } = await setupRemote(t, remoteName)
          await git(
            ['config', 'branch.autoSetupMerge', 'true'],
            repository.path,
            'enable automatic upstream tracking'
          )
          const startPoint = `${remoteName}/master`
          const expected = await getRefOrError(
            repository,
            `refs/remotes/${startPoint}`
          )

          await createBranch(repository, 'from-remote', startPoint, noTrack)

          const branch = await getBranchOrError(repository, 'from-remote')
          assert.strictEqual(branch.tip.sha, expected.sha)
          assert.strictEqual(branch.upstream, noTrack ? null : startPoint)
        })
      }

      it('deletes a remote branch and its tracking ref', async t => {
        const { repository, upstream, remote } = await setupRemote(
          t,
          remoteName
        )
        await git(['branch', 'topic'], upstream.path, 'create remote branch')
        await fetch(repository, remote)
        assert(
          await getRefOrError(repository, `refs/remotes/${remoteName}/topic`)
        )

        await deleteRemoteBranch(repository, remote, 'topic')

        for (const [path, ref] of [
          [upstream.path, 'refs/heads/topic'],
          [repository.path, `refs/remotes/${remoteName}/topic`],
        ]) {
          const result = await git(
            ['show-ref', '--verify', '--quiet', ref],
            path,
            'verify deleted branch',
            { successExitCodes: new Set([0, 1]) }
          )
          assert.strictEqual(result.exitCode, 1)
        }
      })

      for (const withProgress of [false, true]) {
        it(`fetches updates with progress ${withProgress}`, async t => {
          const { repository, upstream, remote } = await setupRemote(
            t,
            remoteName
          )
          const progress = t.mock.fn()

          await fetch(repository, remote, withProgress ? progress : undefined)

          const actual = await getRefOrError(
            repository,
            `refs/remotes/${remoteName}/master`
          )
          const expected = await getTipOrError(upstream)
          assert.strictEqual(actual.sha, expected.sha)
          assert.strictEqual(progress.mock.callCount() > 0, withProgress)
        })

        it(`pushes a branch and tags with progress ${withProgress}`, async t => {
          const { repository, upstream, remote } = await setupRemote(
            t,
            remoteName
          )
          await makeCommit(repository, {
            entries: [{ path: 'new-file.txt', contents: 'new content' }],
          })
          await git(['tag', 'v1.0'], repository.path, 'create tag')
          await writeFile(
            Path.join(repository.path, '.git', 'hooks', 'pre-push'),
            '#!/bin/sh\nexit 1\n',
            { mode: 0o755 }
          )
          const progress = t.mock.fn()

          await push(
            repository,
            remote,
            'master',
            'published',
            ['refs/tags/v1.0'],
            { noVerify: true },
            withProgress ? progress : undefined
          )

          const expected = await getTipOrError(repository)
          const branch = await getRefOrError(upstream, 'refs/heads/published')
          const tag = await getRefOrError(upstream, 'refs/tags/v1.0')
          assert.strictEqual(branch.sha, expected.sha)
          assert.strictEqual(tag.sha, expected.sha)
          assert.strictEqual(progress.mock.callCount() > 0, withProgress)
        })
      }

      it('fetches an explicit refspec', async t => {
        const { repository, upstream, remote } = await setupRemote(
          t,
          remoteName
        )

        await fetchRefspec(
          repository,
          remote,
          `refs/heads/master:refs/remotes/${remoteName}/explicit`
        )

        const actual = await getRefOrError(
          repository,
          `refs/remotes/${remoteName}/explicit`
        )
        const expected = await getTipOrError(upstream)
        assert.strictEqual(actual.sha, expected.sha)
      })
    })
  }

  for (const withProgress of [false, true]) {
    it(`pulls updates with progress ${withProgress}`, async t => {
      const { repository, upstream, remote } = await setupRemote(t, 'origin')
      const progress = t.mock.fn()

      await pull(repository, remote, {
        progressCallback: withProgress ? progress : undefined,
        noVerify: withProgress,
      })

      const actual = await getTipOrError(repository)
      const expected = await getTipOrError(upstream)
      assert.strictEqual(actual.sha, expected.sha)
      assert.strictEqual(progress.mock.callCount() > 0, withProgress)
    })
  }

  for (const name of ['-remote', '--remote', '--dry-run']) {
    it(`rejects pulling from ${name} before reporting progress`, async t => {
      const { repository, remote } = await setupRemote(t, name)
      const before = await getTipOrError(repository)
      const progress = t.mock.fn()
      const branch = await getBranchOrError(repository, 'master')
      assert.strictEqual(branch.upstream, `${name}/master`)
      assert(branch.upstream !== null)

      assert.strictEqual(
        await getMergeBase(repository, branch.name, branch.upstream),
        before.sha
      )

      await assert.rejects(
        pull(repository, remote, { progressCallback: progress }),
        {
          name: 'Error',
          message: "Cannot pull from a remote whose name starts with '-'.",
        }
      )

      const after = await getTipOrError(repository)
      assert.strictEqual(after.sha, before.sha)
      assert.strictEqual(progress.mock.callCount(), 0)
    })
  }
})
