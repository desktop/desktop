import * as path from 'path'
import * as FSE from 'fs-extra'
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
import { IRemote } from '../../../src/models/remote'
import { findDefaultRemote } from '../../../src/lib/stores/helpers/find-default-remote'
import { getStatusOrThrow } from '../../helpers/status'
import { assertNonNullable } from '../../../src/lib/fatal-error'

describe('git/tag', () => {
  let repository: Repository

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('createTag', () => {
    it('creates a tag with the given name', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.tags).toEqual(['my-new-tag'])
    })

    it('creates a tag with the a comma in it', async () => {
      await createTag(repository, 'my-new-tag,has-a-comma', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.tags).toEqual(['my-new-tag,has-a-comma'])
    })

    it('creates multiple tags', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')
      await createTag(repository, 'another-tag', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.tags).toEqual(['my-new-tag', 'another-tag'])
    })

    it('creates a tag on a specified commit', async () => {
      const commits = await getCommits(repository, 'HEAD', 2)
      const commitSha = commits[1].sha

      await createTag(repository, 'my-new-tag', commitSha)

      const commit = await getCommit(repository, commitSha)

      expect(commit).not.toBeNull()
      expect(commit!.tags).toEqual(['my-new-tag'])
    })

    it('fails when creating a tag with a name that already exists', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      expect(createTag(repository, 'my-new-tag', 'HEAD')).rejects.toThrow(
        /already exists/i
      )
    })
  })

  describe('deleteTag', () => {
    it('deletes a tag with the given name', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')
      await deleteTag(repository, 'my-new-tag')

      const commit = await getCommit(repository, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.tags).toEqual([])
    })
  })

  describe('getAllTags', () => {
    it('returns an empty array when the repository has no tags', async () => {
      expect(await getAllTags(repository)).toEqual(new Map())
    })

    it('returns all the created tags', async () => {
      const commit = await getCommit(repository, 'HEAD')
      await createTag(repository, 'my-new-tag', commit!.sha)
      await createTag(repository, 'another-tag', commit!.sha)

      expect(await getAllTags(repository)).toEqual(
        new Map([
          ['my-new-tag', commit!.sha],
          ['another-tag', commit!.sha],
        ])
      )
    })
  })

  describe('fetchTagsToPush', () => {
    let remoteRepository: Repository
    let originRemote: IRemote

    beforeEach(async () => {
      const path = await setupFixtureRepository('test-repo-with-tags')
      remoteRepository = new Repository(path, -1, null, false)
      repository = await setupLocalForkOfRepository(remoteRepository)

      const remotes = await getRemotes(repository)
      originRemote = findDefaultRemote(remotes)!
    })

    it('returns an empty array when there are no tags to get pushed', async () => {
      expect(
        await fetchTagsToPush(repository, originRemote, 'master')
      ).toIncludeAllMembers([])
    })

    it("returns local tags that haven't been pushed", async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      expect(await fetchTagsToPush(repository, originRemote, 'master')).toEqual(
        ['my-new-tag']
      )
    })

    it('returns an empty array after pushing the tag', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      await push(repository, originRemote, 'master', null, ['my-new-tag'])

      expect(await fetchTagsToPush(repository, originRemote, 'master')).toEqual(
        []
      )
    })

    it('does not return a tag created on a non-pushed branch', async () => {
      // Create a tag on a local branch that's not pushed to the remote.
      const branchName = 'new-branch'
      await createBranch(repository, branchName, 'master')
      const [branch] = await getBranches(repository, `refs/heads/${branchName}`)
      assertNonNullable(branch, `Could not create branch ${branchName}`)

      await FSE.writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')
      const status = await getStatusOrThrow(repository)
      const files = status.workingDirectory.files

      await checkoutBranch(repository, branch!, null)
      const commitSha = await createCommit(repository, 'a commit', files)
      await createTag(repository, 'my-new-tag', commitSha)

      expect(await fetchTagsToPush(repository, originRemote, 'master')).toEqual(
        []
      )
    })

    it('returns unpushed tags even if it fails to push the branch', async () => {
      // Create a new commit on the remote repository so the `git push` command
      // that fetchUnpushedTags() does fails.
      await FSE.writeFile(
        path.join(remoteRepository.path, 'README.md'),
        'Hi world\n'
      )
      const status = await getStatusOrThrow(remoteRepository)
      const files = status.workingDirectory.files
      await createCommit(remoteRepository, 'a commit', files)

      await createTag(repository, 'my-new-tag', 'HEAD')

      expect(await fetchTagsToPush(repository, originRemote, 'master')).toEqual(
        ['my-new-tag']
      )
    })
  })
})
