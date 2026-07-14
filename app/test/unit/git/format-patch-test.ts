import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import {
  setupTwoCommitRepo,
  setupFixtureRepository,
} from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { formatPatch } from '../../../src/lib/git'
import {
  cloneLocalRepository,
  makeCommit,
} from '../../helpers/repository-scaffolding'
import { exec } from 'dugite'

describe('formatPatch', () => {
  describe('in a repo with commits', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupTwoCommitRepo(t)
      await makeCommit(repository, {
        entries: [{ path: 'another-one', contents: 'dusty' }],
      })
      return repository
    }

    it('returns a string for a single commit range', async t => {
      const repository = await setup(t)
      const patch = await formatPatch(repository, 'HEAD~', 'HEAD')
      assert.equal(typeof patch, 'string')
      assert.notEqual(patch.length, 0, 'Expected patch to be empty')
    })
    it('returns a string for a multi commit range', async t => {
      const repository = await setup(t)
      const patch = await formatPatch(repository, 'HEAD~2', 'HEAD')
      assert.equal(typeof patch, 'string')
      assert.notEqual(patch.length, 0, 'Expected patch to be empty')
    })
    it('returns empty string for no range', async t => {
      const repository = await setup(t)
      const patch = await formatPatch(repository, 'HEAD', 'HEAD')
      assert.equal(typeof patch, 'string')
      assert.equal(patch.length, 0, 'Expected patch to be empty')
    })
    describe('applied in a related repo', () => {
      it('will be applied cleanly', async t => {
        const repository = await setup(t)
        const clonedRepository = await cloneLocalRepository(t, repository)
        await makeCommit(clonedRepository, {
          entries: [{ path: 'okay-file', contents: 'okay' }],
        })

        const patch = await formatPatch(repository, 'HEAD~', 'HEAD')
        const result = await exec(['apply'], clonedRepository.path, {
          stdin: patch,
        })
        assert(result)
      })
    })
  })
  describe('in a repo with 105 commits', () => {
    it('can create a series of commits from start to HEAD', async t => {
      const path = await setupFixtureRepository(
        t,
        'repository-with-105-commits'
      )
      const repository = new Repository(path, -1, null, false)
      const { stdout } = await exec(
        ['rev-list', '--max-parents=0', 'HEAD'],
        path
      )
      const firstCommit = stdout.trim()

      assert.equal(
        typeof (await formatPatch(repository, firstCommit, 'HEAD')),
        'string'
      )
    })
  })
})
