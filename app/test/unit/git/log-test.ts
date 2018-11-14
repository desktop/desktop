// TODO: remove this and update tests in next commit
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { getChangedFiles, getCommits } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import { AppFileStatusKind } from '../../../src/models/status'
import { GitProcess } from 'dugite'

describe('git/log', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getCommits', () => {
    it('loads history', async () => {
      const commits = await getCommits(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(5)

      const firstCommit = commits[commits.length - 1]
      expect(firstCommit.summary).to.equal('first')
      expect(firstCommit.sha).to.equal(
        '7cd6640e5b6ca8dbfd0b33d0281ebe702127079c'
      )
    })

    it('handles repository with HEAD file on disk', async () => {
      const path = await setupFixtureRepository('repository-with-HEAD-file')
      const repo = new Repository(path, 1, null, false)
      const commits = await getCommits(repo, 'HEAD', 100)
      expect(commits.length).to.equal(2)
    })

    it('handles repository with signed commit and log.showSignature set', async () => {
      const path = await setupFixtureRepository('just-doing-some-signing')
      const repository = new Repository(path, 1, null, false)

      // ensure the test repository is configured to detect copies
      await GitProcess.exec(
        ['config', 'log.showSignature', 'true'],
        repository.path
      )

      const commits = await getCommits(repository, 'HEAD', 100)

      expect(commits.length).to.equal(1)
      expect(commits[0].sha).to.equal(
        '415e4987158c49c383ce7114e0ef00ebf4b070c1'
      )
    })
  })

  describe('getChangedFiles', () => {
    it('loads the files changed in the commit', async () => {
      const files = await getChangedFiles(
        repository!,
        '7cd6640e5b6ca8dbfd0b33d0281ebe702127079c'
      )
      expect(files.length).to.equal(1)
      expect(files[0].path).to.equal('README.md')
      expect(files[0].status.kind).to.equal(AppFileStatusKind.New)
    })

    it('detects renames', async () => {
      const testRepoPath = await setupFixtureRepository(
        'rename-history-detection'
      )
      repository = new Repository(testRepoPath, -1, null, false)

      const first = await getChangedFiles(repository, '55bdecb')
      expect(first.length).to.equal(1)
      expect(first[0].status.kind).to.equal(AppFileStatusKind.Renamed)
      expect(first[0].oldPath).to.equal('NEW.md')
      expect(first[0].path).to.equal('NEWER.md')

      const second = await getChangedFiles(repository, 'c898ca8')
      expect(second.length).to.equal(1)
      expect(second[0].status.kind).to.equal(AppFileStatusKind.Renamed)
      expect(second[0].oldPath).to.equal('OLD.md')
      expect(second[0].path).to.equal('NEW.md')
    })

    it('detect copies', async () => {
      const testRepoPath = await setupFixtureRepository(
        'copies-history-detection'
      )
      repository = new Repository(testRepoPath, -1, null, false)

      // ensure the test repository is configured to detect copies
      await GitProcess.exec(
        ['config', 'diff.renames', 'copies'],
        repository.path
      )

      const files = await getChangedFiles(repository, 'a500bf415')
      expect(files.length).to.equal(2)

      expect(files[0].status.kind).to.equal(AppFileStatusKind.Copied)
      expect(files[0].oldPath).to.equal('initial.md')
      expect(files[0].path).to.equal('duplicate-with-edits.md')

      expect(files[1].status.kind).to.equal(AppFileStatusKind.Copied)
      expect(files[1].oldPath).to.equal('initial.md')
      expect(files[1].path).to.equal('duplicate.md')
    })

    it('handles commit when HEAD exists on disk', async () => {
      const files = await getChangedFiles(repository!, 'HEAD')
      expect(files.length).to.equal(1)
      expect(files[0].path).to.equal('README.md')
      expect(files[0].status.kind).to.equal(AppFileStatusKind.Modified)
    })
  })
})
