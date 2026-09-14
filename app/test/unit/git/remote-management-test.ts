import assert from 'node:assert'
import { describe, it } from 'node:test'
import { git } from '../../../src/lib/git/core'
import {
  addRemote,
  removeRemote,
  setRemoteURL,
} from '../../../src/lib/git/remote'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/remote management', () => {
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
