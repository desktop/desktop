import * as chai from 'chai'
import { StatsStore } from '../../src/lib/stats/stats-store'
import { StatsDatabase } from '../../src/lib/stats'
import { Account } from '../../src/models/account'
import { Email } from '../../src/models/email'

const expect = chai.expect

function createAccounts(count: number) {
  const accounts = []

  for (let i = 0; i < count; i++) {
    accounts.push(new Account(`Account ${i}`, '', '', new Array<Email>(), '', 1, ''))
  }

  return accounts
}

describe('StatsStore', () => {
  let statsStore: StatsStore | null = null

  beforeEach(() => {
    statsStore = new StatsStore(new StatsDatabase('TestStatsDatabase'))
  })

  describe('user opts out', () => {
    it('returns null', () => {
      //Arrange
      statsStore!.setOptOut(true)

      //Act
      statsStore!.reportStats(createAccounts(3))

      //Assert
    })
  })
})
