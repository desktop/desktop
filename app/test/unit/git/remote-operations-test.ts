import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import * as Path from 'path'

import { git } from '../../../src/lib/git/core'
import { fetch, fetchRefspec } from '../../../src/lib/git/fetch'
import { pull } from '../../../src/lib/git/pull'
import { push } from '../../../src/lib/git/push'
import { getMergeBase } from '../../../src/lib/git/merge'
import { IRemote } from '../../../src/models/remote'
import { setupEmptyRepository } from '../../helpers/repositories'
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
