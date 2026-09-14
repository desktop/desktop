import assert from 'node:assert'
import { describe, it } from 'node:test'
import { git } from '../../../src/lib/git/core'
import { addRemote } from '../../../src/lib/git/remote'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/remote management', () => {
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
