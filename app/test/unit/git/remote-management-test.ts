import assert from 'node:assert'
import { describe, it } from 'node:test'
import { git } from '../../../src/lib/git/core'
import {
  addRemote,
  getRemoteURL,
  removeRemote,
  setRemoteURL,
  updateRemoteHEAD,
} from '../../../src/lib/git/remote'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/remote management', () => {
  describe('updateRemoteHEAD', () => {
    for (const name of ['origin', '--remote']) {
      for (const isBackgroundTask of [false, true]) {
        it(`updates ${name} HEAD with background=${isBackgroundTask}`, async t => {
          const repository = await setupEmptyRepository(t)
          const upstream = await setupEmptyRepository(t, 'main')
          await git(
            ['commit', '--allow-empty', '-m', 'Initial commit'],
            upstream.path,
            'create upstream commit'
          )
          await git(
            ['branch', 'next'],
            upstream.path,
            'create next default branch'
          )
          await git(
            ['remote', 'add', '--', name, upstream.path],
            repository.path,
            'set up local upstream'
          )
          await git(
            [
              'fetch',
              '--',
              upstream.path,
              `+refs/heads/*:refs/remotes/${name}/*`,
            ],
            repository.path,
            'fetch local upstream branches'
          )
          const remote = { name, url: upstream.path }

          await updateRemoteHEAD(repository, remote, isBackgroundTask)

          const initial = await git(
            ['symbolic-ref', `refs/remotes/${name}/HEAD`],
            repository.path,
            'read initial remote HEAD'
          )
          assert.strictEqual(initial.stdout, `refs/remotes/${name}/main\n`)

          await git(
            ['symbolic-ref', 'HEAD', 'refs/heads/next'],
            upstream.path,
            'change upstream default branch'
          )
          await updateRemoteHEAD(repository, remote, isBackgroundTask)

          const updated = await git(
            ['symbolic-ref', `refs/remotes/${name}/HEAD`],
            repository.path,
            'read updated remote HEAD'
          )
          assert.strictEqual(updated.stdout, `refs/remotes/${name}/next\n`)
        })
      }

      it(`tolerates missing remote ${name}`, async t => {
        const repository = await setupEmptyRepository(t)
        await assert.doesNotReject(
          updateRemoteHEAD(repository, { name, url: repository.path }, false)
        )
      })
    }
  })

  describe('getRemoteURL', () => {
    for (const name of ['origin', '--remote']) {
      it(`reads the fetch URL for ${name}`, async t => {
        const repository = await setupEmptyRepository(t)
        const url = '/path/with spaces/repository'
        await git(
          ['remote', 'add', '--', name, url],
          repository.path,
          'set up remote to read'
        )
        await git(
          ['config', `remote.${name}.pushurl`, '/push-only'],
          repository.path,
          'set up distinct push URL'
        )

        assert.strictEqual(await getRemoteURL(repository, name), `${url}\n`)
      })

      it(`returns null for missing remote ${name}`, async t => {
        const repository = await setupEmptyRepository(t)
        assert.strictEqual(await getRemoteURL(repository, name), null)
      })
    }
  })

  describe('setRemoteURL', () => {
    for (const name of ['origin', '--remote']) {
      for (const url of ['/path/with spaces/repository', '--push']) {
        it(`sets ${name} to URL ${url} literally`, async t => {
          const repository = await setupEmptyRepository(t)
          await git(
            ['remote', 'add', '--', name, '/original'],
            repository.path,
            'set up remote to update'
          )

          assert.strictEqual(await setRemoteURL(repository, name, url), true)

          const result = await git(
            ['config', '--get', `remote.${name}.url`],
            repository.path,
            'read updated remote URL'
          )
          assert.strictEqual(result.stdout.trim(), url)
        })
      }

      it(`rejects missing remote ${name}`, async t => {
        const repository = await setupEmptyRepository(t)
        await assert.rejects(setRemoteURL(repository, name, '/replacement'))
      })
    }
  })

  describe('removeRemote', () => {
    for (const name of ['origin', '--remote']) {
      it(`removes ${name} without changing other remotes`, async t => {
        const repository = await setupEmptyRepository(t)
        await git(
          ['remote', 'add', '--', name, '/repository'],
          repository.path,
          'set up remote to remove'
        )
        await git(
          ['remote', 'add', '--', 'retained', '/retained'],
          repository.path,
          'set up retained remote'
        )

        await removeRemote(repository, name)

        const result = await git(
          ['remote'],
          repository.path,
          'list remaining remotes'
        )
        assert.strictEqual(result.stdout, 'retained\n')
      })

      it(`ignores missing remote ${name}`, async t => {
        const repository = await setupEmptyRepository(t)
        await assert.doesNotReject(removeRemote(repository, name))
      })
    }
  })

  describe('addRemote', () => {
    for (const name of ['origin', '--remote']) {
      for (const url of ['/path/with spaces/repository', '--mirror']) {
        it(`adds ${name} with URL ${url} literally`, async t => {
          const repository = await setupEmptyRepository(t)

          assert.deepStrictEqual(await addRemote(repository, name, url), {
            name,
            url,
          })

          const result = await git(
            ['config', '--get', `remote.${name}.url`],
            repository.path,
            'read remote URL'
          )
          assert.strictEqual(result.stdout.trim(), url)
        })
      }
    }

    it('rejects duplicate remote names', async t => {
      const repository = await setupEmptyRepository(t)
      await addRemote(repository, 'origin', '/original')

      await assert.rejects(addRemote(repository, 'origin', '/replacement'))
      const result = await git(
        ['config', '--get', 'remote.origin.url'],
        repository.path,
        'read original remote URL'
      )
      assert.strictEqual(result.stdout.trim(), '/original')
    })
  })
})
