import * as path from 'path'
import * as FSE from 'fs-extra'
import { GitProcess } from 'dugite'

import { Repository } from '../../../src/models/repository'

import { getStatusOrThrow } from '../../helpers/status'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
  setupConflictedRepoWithMultipleFiles,
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
        repository = await setupConflictedRepoWithMultipleFiles()
        filePath = path.join(repository.path, 'foo')
      })

      it('parses conflicted files', async () => {
        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(5)
        const file = files.find(f => f.path === 'foo')
        expect(file!.status).toBe(AppFileStatus.Conflicted)
      })

      it('parses resolved files', async () => {
        await FSE.writeFile(filePath, 'b1b2')
        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(5)
        const file = files.find(f => f.path === 'foo')
        expect(file!.status).toBe(AppFileStatus.Resolved)
      })
    })

    describe('with conflicted images repo', () => {
      beforeEach(async () => {
        const path = await setupFixtureRepository(
          'detect-conflict-in-binary-file'
        )
        repository = new Repository(path, -1, null, false)
        await GitProcess.exec(['checkout', 'make-a-change'], repository.path)
      })

      it('parses conflicted image file on merge', async () => {
        const repo = repository!

        await GitProcess.exec(['merge', 'master'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const file = files[0]
        expect(file.status).toBe(AppFileStatus.Conflicted)
      })

      it('parses conflicted image file on merge after removing', async () => {
        const repo = repository!

        await GitProcess.exec(['rm', 'my-cool-image.png'], repo.path)
        await GitProcess.exec(['commit', '-am', 'removed the image'], repo.path)

        await GitProcess.exec(['merge', 'master'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(1)

        const file = files[0]
        expect(file.status).toBe(AppFileStatus.Conflicted)
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
        expect(files).toHaveLength(1)

        const file = files[0]
        expect(file.path).toBe('README.md')
        expect(file.status).toBe(AppFileStatus.Modified)
      })

      it('returns an empty array when there are no changes', async () => {
        const status = await getStatusOrThrow(repository!)
        const files = status.workingDirectory.files
        expect(files).toHaveLength(0)
      })

      it('reflects renames', async () => {
        const repo = await setupEmptyRepository()

        await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

        await GitProcess.exec(['add', 'foo'], repo.path)
        await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
        await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

        const status = await getStatusOrThrow(repo)
        const files = status.workingDirectory.files

        expect(files).toHaveLength(1)
        expect(files[0].status).toBe(AppFileStatus.Renamed)
        expect(files[0].oldPath).toBe('foo')
        expect(files[0].path).toBe('bar')
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

        expect(files).toHaveLength(2)

        expect(files[0].status).toBe(AppFileStatus.Modified)
        expect(files[0].oldPath).toBeUndefined()
        expect(files[0].path).toBe('CONTRIBUTING.md')

        expect(files[1].status).toBe(AppFileStatus.Copied)
        expect(files[1].oldPath).toBe('CONTRIBUTING.md')
        expect(files[1].path).toBe('docs/OVERVIEW.md')
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
          expect(files).toHaveLength(numFiles)
        },
        // needs a little extra time on CI
        25000
      )

      it('returns null for directory without a .git directory', async () => {
        repository = setupEmptyDirectory()
        const status = await getStatus(repository)
        expect(status).toBeNull()
      })
    })
  })
})
