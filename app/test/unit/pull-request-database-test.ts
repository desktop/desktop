import { expect } from 'chai'

import {
  PullRequestDatabase,
  PullRequestStatusTableName,
  PullRequestTableName,
} from '../../src/lib/databases'

const databaseName = 'TestPullRequestDatabase'
const tmpPullRequestTable = 'pullRequestTmp'
//const tmpPullRequestStatusTable = 'pullRequestStatusTmp'

describe('PullRequestDatabase', () => {
  describe('Upgrade', () => {
    describe('PullRequestTable', () => {
      it.only('renames indexes retaining original data when upgrading to version 4 -> 5 -> 6', async () => {
        let database = new PullRequestDatabase(databaseName, 4)
        await database.delete()
        await database.open()

        // untyped because field names have been updated
        const pr = {
          number: 1,
          title: 'title',
          createdAt: '2018-01-01',
          head: {
            repoId: 1,
            ref: 'head',
            sha: 'head.sha',
          },
          base: {
            repoId: 10,
            ref: 'base',
            sha: 'base.sha',
          },
          author: 'me',
        }
        // We need to opt-out of type checking here since
        // the old schema uses an outdated type
        const originalTable = database.table(PullRequestTableName)
        await originalTable.add(pr)
        const prFromDb = await originalTable.get(1)
        expect(prFromDb).to.not.be.undefined

        database.close()
        // we need to run this upgrade first so we can
        // clear out indexes; new data is in tmp tables
        // at this point
        database = new PullRequestDatabase(databaseName, 5)
        await database.open()

        const tmpTable = database.table(tmpPullRequestTable)
        const tmpRecord = await tmpTable.get(1)
        expect(tmpRecord).is.not.undefined
        expect(tmpRecord.number).to.equal(pr.number)

        database.close()
        // this is the upgrade we actually care about
        // data should be back into normal tables at this point
        database = new PullRequestDatabase(databaseName, 6)
        await database.open()

        // this is a major change, so make sure no data is lost
        const upgradedPrFromDb = await database.pullRequest.get(prFromDb.id)
        expect(upgradedPrFromDb).is.not.undefined
        expect(upgradedPrFromDb!._id).to.equal(1)
        expect(upgradedPrFromDb!.number).to.equal(pr.number)
        expect(upgradedPrFromDb!.title).to.equal(pr.title)
        expect(upgradedPrFromDb!.createdAt).to.equal(pr.createdAt)
        expect(upgradedPrFromDb!.head.repositoryId).to.equal(pr.head.repoId)
        expect(upgradedPrFromDb!.base.repositoryId).to.equal(pr.base.repoId)
        expect(upgradedPrFromDb!.head.ref).to.equal(pr.head.ref)
        expect(upgradedPrFromDb!.base.sha).to.equal(pr.base.sha)
        expect(upgradedPrFromDb!.author).to.equal(pr.author)

        database.close()
        await database.delete()
      })
    })

    describe('PullRequestStatusTable', () => {
      it('adds default value for the statuses key when upgrading to version 4', async () => {
        const databaseName = 'TestPullRequestDatabase'

        let database = new PullRequestDatabase(databaseName, 3)
        await database.delete()
        await database.open()

        // insert record that is compatible with v3 of db
        const prStatus = {
          pullRequestId: 1,
          state: 'success',
          totalCount: 1,
          sha: 'sha',
        }
        // Cannot use the safety of types here:
        // the type is no longer valid with this version of the d
        await database.table(PullRequestStatusTableName).add(prStatus)
        const prStatusFromDb = await database
          .table(PullRequestStatusTableName)
          .get(1)
        expect(prStatusFromDb).to.not.be.undefined
        expect(prStatusFromDb!.pullRequestId).to.equal(prStatus.pullRequestId)

        database.close()
        // update to v4 of db
        database = new PullRequestDatabase(databaseName, 4)
        await database.open()

        // get the upgraded record from the db
        // note: there is no type-safety here
        const upgradedPrStatusFromDb = await database
          .table(PullRequestStatusTableName)
          .get(1)
        expect(upgradedPrStatusFromDb).is.not.undefined
        expect(upgradedPrStatusFromDb!.pullRequestId).to.equal(
          prStatus.pullRequestId
        )
        expect(upgradedPrStatusFromDb!.statuses).is.not.undefined

        await database.delete()
      })
    })
  })
})
