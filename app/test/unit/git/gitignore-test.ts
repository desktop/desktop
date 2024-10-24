import * as FSE from 'fs-extra'
import * as Path from 'path'
import { exec } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import { getStatusOrThrow } from '../../helpers/status'
import {
  saveGitIgnore,
  readGitIgnoreAtRoot,
  appendIgnoreRule,
  escapeGitSpecialCharacters,
  appendIgnoreFile,
} from '../../../src/lib/git'
import { setupLocalConfig } from '../../helpers/local-config'

describe('gitignore', () => {
  describe('readGitIgnoreAtRoot', () => {
    it('returns null when .gitignore does not exist on disk', async () => {
      const repo = await setupEmptyRepository()

      const gitignore = await readGitIgnoreAtRoot(repo)

      expect(gitignore).toBeNull()
    })

    it('reads contents from disk', async () => {
      const repo = await setupEmptyRepository()
      const path = repo.path

      const expected = 'node_modules\nyarn-error.log\n'

      const ignoreFile = `${path}/.gitignore`
      await FSE.writeFile(ignoreFile, expected)

      const gitignore = await readGitIgnoreAtRoot(repo)

      expect(gitignore).toBe(expected)
    })

    it('when autocrlf=true and safecrlf=true, appends CRLF to file', async () => {
      const repo = await setupEmptyRepository()

      await setupLocalConfig(repo, [
        ['core.autocrlf', 'true'],
        ['core.safecrlf', 'true'],
      ])

      const { path } = repo

      await saveGitIgnore(repo, 'node_modules')
      await exec(['add', '.gitignore'], path)

      const commit = await exec(
        ['commit', '-m', 'create the ignore file'],
        path
      )
      expect(commit.exitCode).toBe(0)

      const contents = await readGitIgnoreAtRoot(repo)
      expect(contents!.endsWith('\r\n'))
    })

    it('when autocrlf=input, appends LF to file', async () => {
      const repo = await setupEmptyRepository()

      setupLocalConfig(repo, [
        // ensure this repository only ever sticks to LF
        ['core.eol', 'lf'],
        // do not do any conversion of line endings when committing
        ['core.autocrlf', 'input'],
      ])

      const { path } = repo

      await saveGitIgnore(repo, 'node_modules')
      await exec(['add', '.gitignore'], path)

      const commit = await exec(
        ['commit', '-m', 'create the ignore file'],
        path
      )
      expect(commit.exitCode).toBe(0)

      const contents = await readGitIgnoreAtRoot(repo)
      expect(contents!.endsWith('\n'))
    })
  })

  describe('saveGitIgnore', () => {
    it(`creates gitignore file when it doesn't exist`, async () => {
      const repo = await setupEmptyRepository()

      await saveGitIgnore(repo, 'node_modules\n')

      const exists = await FSE.pathExists(`${repo.path}/.gitignore`)

      expect(exists).toBe(true)
    })

    it('deletes gitignore file when no entries provided', async () => {
      const repo = await setupEmptyRepository()
      const path = repo.path

      const ignoreFile = `${path}/.gitignore`
      await FSE.writeFile(ignoreFile, 'node_modules\n')

      // update gitignore file to be empty
      await saveGitIgnore(repo, '')

      const exists = await FSE.pathExists(ignoreFile)
      expect(exists).toBe(false)
    })

    it('applies rule correctly to repository', async () => {
      const repo = await setupEmptyRepository()

      const path = repo.path

      await saveGitIgnore(repo, '*.txt\n')
      await exec(['add', '.gitignore'], path)
      await exec(['commit', '-m', 'create the ignore file'], path)

      // Create a txt file
      const file = Path.join(repo.path, 'a.txt')

      await FSE.writeFile(file, 'thrvbnmerkl;,iuw')

      // Check status of repo
      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files).toHaveLength(0)
    })

    it('escapes string with special git characters', async () => {
      const unescapedFilePath = '[never]\\!gonna*give#you?_.up'
      const escapedFilePath = '\\[never\\]\\\\!gonna\\*give\\#you\\?_.up'

      const result = escapeGitSpecialCharacters(unescapedFilePath)
      expect(result).toBe(escapedFilePath)
    })
  })

  describe('appendIgnoreRule', () => {
    it('appends one rule', async () => {
      const repo = await setupEmptyRepository()

      await setupLocalConfig(repo, [['core.autocrlf', 'true']])

      const { path } = repo

      const ignoreFile = `${path}/.gitignore`
      await FSE.writeFile(ignoreFile, 'node_modules\n')

      await appendIgnoreRule(repo, ['yarn-error.log'])

      const gitignore = await FSE.readFile(ignoreFile)

      const expected = 'node_modules\nyarn-error.log\n'
      expect(gitignore.toString('utf8')).toBe(expected)
    })

    it('appends multiple rules', async () => {
      const repo = await setupEmptyRepository()

      await setupLocalConfig(repo, [['core.autocrlf', 'true']])

      const { path } = repo

      const ignoreFile = `${path}/.gitignore`
      await FSE.writeFile(ignoreFile, 'node_modules\n')

      await appendIgnoreRule(repo, ['yarn-error.log', '.eslintcache', 'dist/'])

      const gitignore = await FSE.readFile(ignoreFile)

      const expected = 'node_modules\nyarn-error.log\n.eslintcache\ndist/\n'
      expect(gitignore.toString('utf8')).toBe(expected)
    })

    it('appends one file containing special characters', async () => {
      const repo = await setupEmptyRepository()

      await setupLocalConfig(repo, [['core.autocrlf', 'true']])

      const { path } = repo

      const ignoreFile = `${path}/.gitignore`
      await FSE.writeFile(ignoreFile, 'node_modules\n')

      const fileToIgnore = '[never]!gonna*give#you?_.up'
      await appendIgnoreFile(repo, [fileToIgnore])

      const gitignore = await FSE.readFile(ignoreFile)

      const expected =
        'node_modules\n' + '\\[never\\]\\!gonna\\*give\\#you\\?_.up\n'
      expect(gitignore.toString('utf8')).toBe(expected)
    })
  })
})
