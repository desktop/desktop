import { Repository } from '../../../src/models/repository'
import { getCommit, createTag, getCommits } from '../../../src/lib/git'

import { setupFixtureRepository } from '../../helpers/repositories'

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
})
