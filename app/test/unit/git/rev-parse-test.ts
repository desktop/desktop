import * as path from 'path'
import * as FSE from 'fs-extra'
import * as os from 'os'

import { Repository } from '../../../src/models/repository'
import { getRepositoryType } from '../../../src/lib/git/rev-parse'
import { git } from '../../../src/lib/git/core'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { exec } from 'dugite'
import { mkdirSync } from '../../helpers/temp'
import { writeFile } from 'fs-extra'

describe('git/rev-parse', () => {
  let repository: Repository

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getRepositoryType', () => {
    it('should return an absolute path when run inside a working directory', async () => {
      expect(await getRepositoryType(repository.path)).toMatchObject({
        kind: 'regular',
        topLevelWorkingDirectory: repository.path,
      })

      const subdirPath = path.join(repository.path, 'subdir')
      await FSE.mkdir(subdirPath)

      expect(await getRepositoryType(subdirPath)).toMatchObject({
        kind: 'regular',
        topLevelWorkingDirectory: repository.path,
      })
    })

    it('should return missing when not run inside a working directory', async () => {
      const result = await getRepositoryType(os.tmpdir())
      expect(result).toMatchObject({ kind: 'missing' })
    })

    it('should return correct path for submodules', async () => {
      const fixturePath = mkdirSync('get-top-level-working-directory-test-')

      const firstRepoPath = path.join(fixturePath, 'repo1')
      const secondRepoPath = path.join(fixturePath, 'repo2')

      await git(['init', 'repo1'], fixturePath, '')

      await git(['init', 'repo2'], fixturePath, '')

      await git(
        ['commit', '--allow-empty', '-m', 'Initial commit'],
        secondRepoPath,
        ''
      )

      await git(
        [
          // Git 2.38 (backported into 2.35.5) changed the default here to 'user'
          ...['-c', 'protocol.file.allow=always'],
          ...['submodule', 'add', '../repo2'],
        ],
        firstRepoPath,
        ''
      )

      expect(await getRepositoryType(firstRepoPath)).toMatchObject({
        kind: 'regular',
        topLevelWorkingDirectory: firstRepoPath,
      })

      const subModulePath = path.join(firstRepoPath, 'repo2')
      expect(await getRepositoryType(subModulePath)).toMatchObject({
        kind: 'regular',
        topLevelWorkingDirectory: subModulePath,
      })
    })

    it('returns regular for default initialized repository', async () => {
      const repository = await setupEmptyRepository()
      expect(await getRepositoryType(repository.path)).toMatchObject({
        kind: 'regular',
        topLevelWorkingDirectory: repository.path,
      })
    })

    it('returns bare for initialized bare repository', async () => {
      const path = mkdirSync('no-repository-here')
      await exec(['init', '--bare'], path)
      expect(await getRepositoryType(path)).toMatchObject({
        kind: 'bare',
      })
    })

    it('returns missing for empty directory', async () => {
      const p = mkdirSync('no-actual-repository-here')
      expect(await getRepositoryType(p)).toMatchObject({
        kind: 'missing',
      })
    })

    it('returns missing for missing directory', async () => {
      const rootPath = mkdirSync('no-actual-repository-here')
      const missingPath = path.join(rootPath, 'missing-folder')

      expect(await getRepositoryType(missingPath)).toMatchObject({
        kind: 'missing',
      })
    })

    it('returns unsafe for unsafe repository', async () => {
      const previousHomeValue = process.env['HOME']

      // Creating a stub global config so we can unset safe.directory config
      // which will supersede any system config that might set * to ignore
      // warnings about a different owner
      //
      // This is because safe.directory setting is ignored if found in local
      // config, environment variables or command line arguments.
      const testHomeDirectory = mkdirSync('test-home-directory')
      const gitConfigPath = path.join(testHomeDirectory, '.gitconfig')
      await writeFile(
        gitConfigPath,
        `[safe]
directory=`
      )

      process.env['HOME'] = testHomeDirectory
      process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = '1'

      expect(await getRepositoryType(repository.path)).toMatchObject({
        kind: 'unsafe',
      })

      process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = undefined
      process.env['HOME'] = previousHomeValue
    })
  })
})
