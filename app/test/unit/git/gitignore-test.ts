import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFile, writeFile } from 'fs/promises'
import { pathExists } from '../../../src/lib/path-exists'
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
    it('returns null when .gitignore does not exist on disk', async t => {
      const repo = await setupEmptyRepository(t)

      const gitignore = await readGitIgnoreAtRoot(repo)

      assert(gitignore === null)
    })

    it('reads contents from disk', async t => {
      const repo = await setupEmptyRepository(t)
      const path = repo.path

      const expected = 'node_modules\nyarn-error.log\n'

      const ignoreFile = `${path}/.gitignore`
      await writeFile(ignoreFile, expected)

      const gitignore = await readGitIgnoreAtRoot(repo)

      assert.equal(gitignore, expected)
    })

    it('when autocrlf=true and safecrlf=true, appends CRLF to file', async t => {
      const repo = await setupEmptyRepository(t)

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
      assert.equal(commit.exitCode, 0)

      const contents = await readGitIgnoreAtRoot(repo)
      assert(contents !== null)
      assert(contents.endsWith('\r\n'))
    })

    it('when autocrlf=input, appends LF to file', async t => {
      const repo = await setupEmptyRepository(t)

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
      assert.equal(commit.exitCode, 0)

      const contents = await readGitIgnoreAtRoot(repo)
      assert(contents !== null)
      assert(contents.endsWith('\n'))
    })
  })

  describe('saveGitIgnore', () => {
    it(`creates gitignore file when it doesn't exist`, async t => {
      const repo = await setupEmptyRepository(t)

      await saveGitIgnore(repo, 'node_modules\n')

      const exists = await pathExists(`${repo.path}/.gitignore`)

      assert(exists)
    })

    it('deletes gitignore file when no entries provided', async t => {
      const repo = await setupEmptyRepository(t)
      const path = repo.path

      const ignoreFile = `${path}/.gitignore`
      await writeFile(ignoreFile, 'node_modules\n')

      // update gitignore file to be empty
      await saveGitIgnore(repo, '')

      const exists = await pathExists(ignoreFile)
      assert(!exists)
    })

    it('applies rule correctly to repository', async t => {
      const repo = await setupEmptyRepository(t)

      const path = repo.path

      await saveGitIgnore(repo, '*.txt\n')
      await exec(['add', '.gitignore'], path)
      await exec(['commit', '-m', 'create the ignore file'], path)

      // Create a txt file
      const file = Path.join(repo.path, 'a.txt')

      await writeFile(file, 'thrvbnmerkl;,iuw')

      // Check status of repo
      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 0)
    })

    it('escapes string with special git characters', async () => {
      const unescapedFilePath = '[never]\\!gonna*give#you?_.up'
      const escapedFilePath = '\\[never\\]\\\\!gonna\\*give\\#you\\?_.up'

      const result = escapeGitSpecialCharacters(unescapedFilePath)
      assert.equal(result, escapedFilePath)
    })
  })

  describe('appendIgnoreRule', () => {
    it('appends one rule', async t => {
      const repo = await setupEmptyRepository(t)

      await setupLocalConfig(repo, [['core.autocrlf', 'true']])

      const { path } = repo

      const ignoreFile = `${path}/.gitignore`
      await writeFile(ignoreFile, 'node_modules\n')

      await appendIgnoreRule(repo, ['yarn-error.log'])

      const gitignore = await readFile(ignoreFile)

      const expected = 'node_modules\nyarn-error.log\n'
      assert.equal(gitignore.toString('utf8'), expected)
    })

    it('appends multiple rules', async t => {
      const repo = await setupEmptyRepository(t)

      await setupLocalConfig(repo, [['core.autocrlf', 'true']])

      const { path } = repo

      const ignoreFile = `${path}/.gitignore`
      await writeFile(ignoreFile, 'node_modules\n')

      await appendIgnoreRule(repo, ['yarn-error.log', '.eslintcache', 'dist/'])

      const gitignore = await readFile(ignoreFile)

      const expected = 'node_modules\nyarn-error.log\n.eslintcache\ndist/\n'
      assert.equal(gitignore.toString('utf8'), expected)
    })

    it('appends one file containing special characters', async t => {
      const repo = await setupEmptyRepository(t)

      await setupLocalConfig(repo, [['core.autocrlf', 'true']])

      const { path } = repo

      const ignoreFile = `${path}/.gitignore`
      await writeFile(ignoreFile, 'node_modules\n')

      const fileToIgnore = '[never]!gonna*give#you?_.up'
      await appendIgnoreFile(repo, [fileToIgnore])

      const gitignore = await readFile(ignoreFile)

      const expected =
        'node_modules\n' + '\\[never\\]\\!gonna\\*give\\#you\\?_.up\n'
      assert.equal(gitignore.toString('utf8'), expected)
    })
  })
})
