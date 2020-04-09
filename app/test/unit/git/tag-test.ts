import { Repository } from '../../../src/models/repository'
import {
  getCommit,
  createTag,
  getCommits,
  getAllTags,
  fetchRemoteTags,
  getRemotes,
} from '../../../src/lib/git'

import {
  setupFixtureRepository,
  setupLocalForkOfRepository,
} from '../../helpers/repositories'
import { Account } from '../../../src/models/account'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { IRemote } from '../../../src/models/remote'
import { findDefaultRemote } from '../../../src/lib/stores/helpers/find-default-remote'

describe('git/tag', () => {
  let repository: Repository
  let account: Account

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)

    account = new Account(
      'monalisa',
      getDotComAPIEndpoint(),
      '',
      [],
      '',
      -1,
      'Caps Lock'
    )
  })

  describe('createTag', () => {
    it('creates a tag with the given name', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      const commit = await getCommit(repository, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.tags).toEqual(['my-new-tag'])
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

  describe('getAllTags', () => {
    it('returns an empty array when the repository has no tags', async () => {
      expect(await getAllTags(repository)).toEqual([])
    })

    it('returns all the created tags', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')
      await createTag(repository, 'another-tag', 'HEAD')

      expect(await getAllTags(repository)).toIncludeAllMembers([
        'my-new-tag',
        'another-tag',
      ])
    })
  })

  describe('fetchRemoteTags', () => {
    let remoteRepository: Repository
    let originRemote: IRemote

    beforeEach(async () => {
      const path = await setupFixtureRepository('test-repo-with-tags')
      remoteRepository = new Repository(path, -1, null, false)
      repository = await setupLocalForkOfRepository(remoteRepository)

      const remotes = await getRemotes(repository)
      originRemote = findDefaultRemote(remotes)!
    })

    it('returns the tags found in the remote repository', async () => {
      expect(
        await fetchRemoteTags(repository!, account, originRemote)
      ).toIncludeAllMembers(['important', 'less-important', 'tentative'])
    })

    it("doesn't return local tags not pushed to the remote", async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      // The new tag is part of the local tags but not on the remote yet.
      expect(await getAllTags(repository)).toInclude('my-new-tag')
      expect(
        await fetchRemoteTags(repository, account, originRemote)
      ).not.toInclude('my-new-tag')
    })
  })
})
