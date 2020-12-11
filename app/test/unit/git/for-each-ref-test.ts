import { Repository } from '../../../src/models/repository'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
} from '../../helpers/repositories'
import { getBranches } from '../../../src/lib/git/for-each-ref'
import { BranchType } from '../../../src/models/branch'

describe('git/for-each-ref', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('repo-with-many-refs')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getBranches', () => {
    it('fetches branches using for-each-ref', async () => {
      const branches = (await getBranches(repository!)).filter(
        b => b.type === BranchType.Local
      )

      expect(branches).toHaveLength(3)

      const commitWithBody = branches[0]
      expect(commitWithBody.name).toBe('commit-with-long-description')
      expect(commitWithBody.upstream).toBeNull()
      expect(commitWithBody.tip.sha).toBe(
        'dfa96676b65e1c0ed43ca25492252a5e384c8efd'
      )
      expect(commitWithBody.tip.shortSha).toBe('dfa9667')
      expect(commitWithBody.tip.summary).toBe('this is a commit title')
      expect(commitWithBody.tip.body).toContain('lucky last')
      expect(commitWithBody.tip.parentSHAs).toHaveLength(1)

      const commitNoBody = branches[1]
      expect(commitNoBody.name).toBe('commit-with-no-body')
      expect(commitNoBody.upstream).toBeNull()
      expect(commitNoBody.tip.sha).toBe(
        '49ec1e05f39eef8d1ab6200331a028fb3dd96828'
      )
      expect(commitNoBody.tip.shortSha).toBe('49ec1e0')
      expect(commitNoBody.tip.summary).toBe('this is a commit title')
      expect(commitNoBody.tip.body).toHaveLength(0)
      expect(commitNoBody.tip.parentSHAs).toHaveLength(1)

      const master = branches[2]
      expect(master.name).toBe('master')
      expect(master.upstream).toBeNull()
      expect(master.tip.sha).toBe('b9ccfc3307240b86447bca2bd6c51a4bb4ade493')
      expect(master.tip.shortSha).toBe('b9ccfc3')
      expect(master.tip.summary).toBe('stubbed a README')
      expect(master.tip.parentSHAs).toHaveLength(1)
    })

    it('should return empty list for empty repo', async () => {
      const repo = await setupEmptyRepository()
      const branches = await getBranches(repo)
      expect(branches).toHaveLength(0)
    })

    it('should return empty list for directory without a .git directory', async () => {
      const repo = setupEmptyDirectory()
      const status = await getBranches(repo)
      expect(status).toHaveLength(0)
    })
  })
})
