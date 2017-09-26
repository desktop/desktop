import * as chai from 'chai'
import { TestPullRequestDatabase } from '../test-pull-requests-database'
import { PullRequestStore } from '../../src/lib/stores'

const expect = chai.expect

describe('PullRequestStore', () => {
  let pullRequestStore: PullRequestStore | null = null

  beforeEach(async () => {
    const pullRequestDatabase = new TestPullRequestDatabase()
    await pullRequestDatabase.reset()

    pullRequestStore = new PullRequestStore(pullRequestDatabase)
  })

  describe('fetching pull requests', () => {
    it('contains the fetched pull request', async () => {
      const prs = await pullRequestStore!.fetchPullRequests()

      expect(prs.length).to.equal(1)
    })
  })
})
