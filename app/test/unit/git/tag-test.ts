import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { writeFile } from 'fs/promises'
import { Repository } from '../../../src/models/repository'
import {
  getCommit,
  createTag,
  getCommits,
  getAllTags,
  getRemotes,
  fetchTagsToPush,
  push,
  createBranch,
  createCommit,
  checkoutBranch,
  deleteTag,
  getBranches,
} from '../../../src/lib/git'
import {
  setupFixtureRepository,
  setupLocalForkOfRepository,
} from '../../helpers/repositories'
import { findDefaultRemote } from '../../../src/lib/stores/helpers/find-default-remote'
import { getStatusOrThrow } from '../../helpers/status'
import { assertNonNullable, forceUnwrap } from '../../../src/lib/fatal-error'

describe('git/tag', () => {
  describe('createTag', () => {
    it('creates a tag with the given name', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createTag(repository, 'my-new-tag', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      assert(commit !== null)
      assert.deepStrictEqual(commit.tags, ['my-new-tag'])
    })

    it('creates a tag with the a comma in it', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createTag(repository, 'my-new-tag,has-a-comma', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      assert(commit !== null)
      assert.deepStrictEqual(commit.tags, ['my-new-tag,has-a-comma'])
    })

    it('creates multiple tags', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createTag(repository, 'my-new-tag', 'HEAD')
      await createTag(repository, 'another-tag', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      assert(commit !== null)
      assert.deepStrictEqual(commit.tags, ['my-new-tag', 'another-tag'])
    })

    it('creates a tag on a specified commit', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const commits = await getCommits(repository, 'HEAD', 2)
      const commitSha = commits[1].sha

      await createTag(repository, 'my-new-tag', commitSha)

      const commit = await getCommit(repository, commitSha)

      assert(commit !== null)
      assert.deepStrictEqual(commit.tags, ['my-new-tag'])
    })

    it('fails when creating a tag with a name that already exists', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createTag(repository, 'my-new-tag', 'HEAD')

      await assert.rejects(
        createTag(repository, 'my-new-tag', 'HEAD'),
        /already exists/i
      )
    })
  })

  describe('deleteTag', () => {
    it('deletes a tag with the given name', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createTag(repository, 'my-new-tag', 'HEAD')
      await deleteTag(repository, 'my-new-tag')

      const commit = await getCommit(repository, 'HEAD')
      assert.equal(commit?.tags.length, 0)
    })
  })

  describe('getAllTags', () => {
    it('returns an empty map when the repository has no tags', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      assert((await getAllTags(repository)).size === 0)
    })

    it('returns all the created tags', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const commit = await getCommit(repository, 'HEAD')
      assert(commit !== null)

      await createTag(repository, 'my-new-tag', commit.sha)
      await createTag(repository, 'another-tag', commit.sha)

      assert.deepStrictEqual(
        await getAllTags(repository),
        new Map([
          ['my-new-tag', commit.sha],
          ['another-tag', commit.sha],
        ])
      )
    })
  })

  describe('fetchTagsToPush', () => {
    const setup = async (t: TestContext) => {
      const path = await setupFixtureRepository(t, 'test-repo-with-tags')
      const remoteRepository = new Repository(path, -1, null, false)
      const repository = await setupLocalForkOfRepository(t, remoteRepository)

      const remotes = await getRemotes(repository)
      const originRemote = forceUnwrap(
        "couldn't find origin remote",
        findDefaultRemote(remotes)
      )

      return { repository, originRemote, remoteRepository }
    }

    it('returns an empty array when there are no tags to get pushed', async t => {
      const { repository, originRemote } = await setup(t)
      assert.equal(
        (await fetchTagsToPush(repository, originRemote, 'master')).length,
        0
      )
    })

    it("returns local tags that haven't been pushed", async t => {
      const { repository, originRemote } = await setup(t)
      await createTag(repository, 'my-new-tag', 'HEAD')

      assert.deepStrictEqual(
        await fetchTagsToPush(repository, originRemote, 'master'),
        ['my-new-tag']
      )
    })

    it('returns an empty array after pushing the tag', async t => {
      const { repository, originRemote } = await setup(t)
      await createTag(repository, 'my-new-tag', 'HEAD')

      await push(repository, originRemote, 'master', null, ['my-new-tag'])

      assert.deepStrictEqual(
        await fetchTagsToPush(repository, originRemote, 'master'),
        []
      )
    })

    it('does not return a tag created on a non-pushed branch', async t => {
      const { repository, originRemote } = await setup(t)
      // Create a tag on a local branch that's not pushed to the remote.
      const branchName = 'new-branch'
      await createBranch(repository, branchName, 'master')
      const branch = (
        await getBranches(repository, `refs/heads/${branchName}`)
      ).at(0)
      assertNonNullable(branch, `Could not create branch ${branchName}`)

      await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')
      const status = await getStatusOrThrow(repository)
      const files = status.workingDirectory.files

      await checkoutBranch(repository, branch, null)
      const commitSha = await createCommit(repository, 'a commit', files)
      await createTag(repository, 'my-new-tag', commitSha)

      assert.deepStrictEqual(
        await fetchTagsToPush(repository, originRemote, 'master'),
        []
      )
    })

    it('returns unpushed tags even if it fails to push the branch', async t => {
      // Create a new commit on the remote repository so the `git push` command
      // that fetchUnpushedTags() does fails.
      const { repository, originRemote, remoteRepository } = await setup(t)
      await writeFile(
        path.join(remoteRepository.path, 'README.md'),
        'Hi world\n'
      )
      const status = await getStatusOrThrow(remoteRepository)
      const files = status.workingDirectory.files
      await createCommit(remoteRepository, 'a commit', files)

      await createTag(repository, 'my-new-tag', 'HEAD')

      assert.deepStrictEqual(
        await fetchTagsToPush(repository, originRemote, 'master'),
        ['my-new-tag']
      )
    })
  })
})
