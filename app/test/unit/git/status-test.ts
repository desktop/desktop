import * as path from 'path'
import { expect } from 'chai'
import * as FSE from 'fs-extra'
import { GitProcess } from 'dugite'

import { Repository } from '../../../src/models/repository'

import { getStatusOrThrow } from '../../helpers/status'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
  setupConflictedRepo,
} from '../../helpers/repositories'
import { AppFileStatus } from '../../../src/models/status'
import * as temp from 'temp'
import { getStatus } from '../../../src/lib/git'

const _temp = temp.track()
const mkdir = _temp.mkdir

describe('git/status', () => {
  describe('getStatus', () => {
    let repository: Repository | null = null

    describe('with conflicted repo', () => {
      let filePath: string

      beforeEach(async () => {
        repository = await setupConflictedRepo()
        filePath = path.join(repository.path, 'foo')
      })

      it('parses conflicted files', async () => {
        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files.length).to.equal(1)

        const file = files[0]
        expect(file.status).to.equal(AppFileStatus.Conflicted)
      })

      it('parses resolved files', async () => {
        await FSE.writeFile(filePath, 'b1b2')
        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files.length).to.equal(1)
        const file = files[0]
        expect(file.status).to.equal(AppFileStatus.Resolved)
      })
    })

    describe('with unconflicted repo', () => {
      beforeEach(async () => {
        const testRepoPath = await setupFixtureRepository('test-repo')
        repository = new Repository(testRepoPath, -1, null, false)
      })

      it('parses changed files', async () => {
        await FSE.writeFile(
          path.join(repository!.path, 'README.md'),
          'Hi world\n'
        )

        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files.length).to.equal(1)

        const file = files[0]
        expect(file.path).to.equal('README.md')
        expect(file.status).to.equal(AppFileStatus.Modified)
      })

      it('returns an empty array when there are no changes', async () => {
        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files.length).to.equal(0)
      })

      it('reflects renames', async () => {
        const repo = await setupEmptyRepository()

        await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

        await GitProcess.exec(['add', 'foo'], repo.path)
        await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
        await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files

        expect(files.length).to.equal(1)
        expect(files[0].status).to.equal(AppFileStatus.Renamed)
        expect(files[0].oldPath).to.equal('foo')
        expect(files[0].path).to.equal('bar')
      })

      it('reflects copies', async () => {
        const testRepoPath = await setupFixtureRepository(
          'copy-detection-status'
        )
        repository = new Repository(testRepoPath, -1, null, false)

        // Git 2.18 now uses a new config value to handle detecting copies, so
        // users who have this enabled will see this. For reference, Desktop does
        // not enable this by default.
        await GitProcess.exec(
          ['config', '--local', 'status.renames', 'copies'],
          repository.path
        )

        await GitProcess.exec(['add', '.'], repository.path)

        const status = await getStatusOrThrow(repository)
        const files = status.workingDirectory.files

        expect(files.length).to.equal(2)

        expect(files[0].status).to.equal(AppFileStatus.Modified)
        expect(files[0].oldPath).to.be.undefined
        expect(files[0].path).to.equal('CONTRIBUTING.md')

        expect(files[1].status).to.equal(AppFileStatus.Copied)
        expect(files[1].oldPath).to.equal('CONTRIBUTING.md')
        expect(files[1].path).to.equal('docs/OVERVIEW.md')
      })

      it(
        'Handles at least 10k untracked files without failing',
        async () => {
          const numFiles = 10000
          const basePath = repository!.path

          await mkdir(basePath)

          // create a lot of files
          const promises = []
          for (let i = 0; i < numFiles; i++) {
            promises.push(
              FSE.writeFile(
                path.join(basePath, `test-file-${i}`),
                'Hey there\n'
              )
            )
          }
          await Promise.all(promises)

          const status = await getStatusOrThrow(repository!)
          const files = status.workingDirectory.files
          expect(files.length).to.equal(numFiles)
        },
        // needs a little extra time on CI
        25000
      )

      it('returns null for directory without a .git directory', async () => {
        repository = setupEmptyDirectory()
        const status = await getStatus(repository)
        expect(status).is.null
      })
    })
  })
})
