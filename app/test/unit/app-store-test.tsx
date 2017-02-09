import * as chai from 'chai'
const expect = chai.expect

import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  EmojiStore,
  IssuesStore,
} from '../../src/lib/dispatcher'

import { GitHubUserDatabase } from '../../src/lib/dispatcher/github-user-database'
import { IssuesDatabase } from '../../src/lib/dispatcher/issues-database'
import { StatsDatabase, StatsStore } from '../../src/lib/stats'

import { TestGitHubUserDatabase } from '../test-github-user-database'
import { TestStatsDatabase } from '../test-stats-database'
import { TestIssuesDatabase } from '../test-issues-database'

import {
  getStatus,
} from '../../src/lib/git'
import { FileStatus } from '../../src/models/status'

import { setupEmptyRepository } from '../fixture-helper'
import * as Fs from 'fs'
import * as Path from 'path'

import { GitProcess } from 'git-kitchen-sink'

describe('AppStore', () => {
  let db: GitHubUserDatabase | null = null
  let issuesDb: IssuesDatabase | null = null
  let statsDb: StatsDatabase | null = null
  let appStore: AppStore | null = null
  let statsStore: StatsStore | null = null

  beforeEach(async () => {
    const testdb = new TestGitHubUserDatabase()
    await testdb.reset()
    db = testdb

    const testIssuesDb = new TestIssuesDatabase()
    await testIssuesDb.reset()
    issuesDb = testIssuesDb

    const testStatsDb = new TestStatsDatabase()
    await testStatsDb.reset()
    statsDb = testStatsDb

    statsStore = new StatsStore(statsDb)
  })

  it('can discard changes from a repository', async () => {

    // TODO: test is currently interacting with electron's shell API directly
    //       -> need to stub that behaviour out

    // TODO: i am literally testing none of these dependencies, which
    // makes me think this should live somewhere else - git-store?

    appStore = new AppStore(
      new GitHubUserStore(db!),
      new CloningRepositoriesStore(),
      new EmojiStore(),
      new IssuesStore(issuesDb!),
      statsStore!)

      const repo = await setupEmptyRepository()
      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

      // commit the file
      await GitProcess.exec([ 'add', file ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'added file' ], repo.path)

      Fs.writeFileSync(filePath, 'WRITING SOME NEW WORDS\n')

      // ignore the file
      await appStore._ignore(repo, file)

      // get the status, see that we only have one gitignore file
      let status = await getStatus(repo)
      let files = status.workingDirectory.files

      expect(files.length).to.equal(2)
      expect(files[0].path).to.equal('README.md')
      expect(files[0].status).to.equal(FileStatus.Deleted)
      expect(files[1].path).to.equal('.gitignore')
      expect(files[1].status).to.equal(FileStatus.New)

      // discard the .gitignore change
      await appStore._discardChanges(repo, [ files[1] ])

      // we should see the original file, modified
      status = await getStatus(repo)
      files = status.workingDirectory.files

      expect(files.length).to.equal(1)
      expect(files[0].path).to.equal('README.md')
      expect(files[0].status).to.equal(FileStatus.Modified)
  })
})
