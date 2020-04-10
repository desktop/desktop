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
} from '../../../src/lib/git'
import {
  setupFixtureRepository,
  setupLocalForkOfRepository,
} from '../../helpers/repositories'
import { Account } from '../../../src/models/account'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { IRemote } from '../../../src/models/remote'
import { findDefaultRemote } from '../../../src/lib/stores/helpers/find-default-remote'
import { getStatusOrThrow } from '../../helpers/status'

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
      'Mona Lisa'
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
        await fetchTagsToPush(repository, account, originRemote, 'master')
      ).toIncludeAllMembers([])
    })

    it("returns local tags that haven't been pushed", async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      expect(
        await fetchTagsToPush(repository, account, originRemote, 'master')
      ).toEqual(['my-new-tag'])
    })

    it('returns an empty array after pushing', async () => {
      await createTag(repository, 'my-new-tag', 'HEAD')

      await push(repository, account, originRemote, 'master', null)

      expect(
        await fetchTagsToPush(repository, account, originRemote, 'master')
      ).toEqual([])
    })

    it('does not return a tag created o a non-pushed branch', async () => {
      // Create a tag on a local branch that's not pushed to the remote.
      const branch = await createBranch(repository, 'new-branch', 'master')

      await FSE.writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')
      const status = await getStatusOrThrow(repository)
      const files = status.workingDirectory.files

      await checkoutBranch(repository, account, branch!)
      const commitSha = await createCommit(repository, 'a commit', files)
      await createTag(repository, 'my-new-tag', commitSha!)

      expect(
        await fetchTagsToPush(repository, account, originRemote, 'master')
      ).toEqual([])
    })
  })
})
