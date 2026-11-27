import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lstat, mkdir, readFile, readlink, symlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { createTempDirectory } from '../app/test/helpers/temp'
import { restoreGitCoreSymlinks } from './restore-git-core-symlinks'

describe(
  'restoreGitCoreSymlinks',
  { skip: process.platform === 'win32' },
  () => {
    it('restores valid in-bundle links and leaves external links dereferenced', async t => {
      const root = await createTempDirectory(t)
      const sourceApp = join(root, 'source')
      const packagedApp = join(root, 'packaged')
      const sourceGit = join(sourceApp, 'git')
      const packagedGit = join(packagedApp, 'git')
      const sourceGitCore = join(sourceGit, 'libexec', 'git-core')
      const packagedGitCore = join(packagedGit, 'libexec', 'git-core')
      const sourceGitBinary = join(sourceGit, 'bin', 'git')
      const packagedGitBinary = join(packagedGit, 'bin', 'git')
      const sourceGitAdd = join(sourceGitCore, 'git-add')
      const packagedGitAdd = join(packagedGitCore, 'git-add')
      const sourceExternalLink = join(sourceGitCore, 'git-external')
      const packagedExternalLink = join(packagedGitCore, 'git-external')
      const target = '../../bin/git'

      await mkdir(dirname(sourceGitBinary), { recursive: true })
      await mkdir(sourceGitCore, { recursive: true })
      await mkdir(dirname(packagedGitBinary), { recursive: true })
      await mkdir(packagedGitCore, { recursive: true })
      await writeFile(sourceGitBinary, 'git executable')
      await writeFile(packagedGitBinary, 'git executable')
      await symlink(target, sourceGitAdd)
      // Simulate Packager's dereferenced copy of the source symlink.
      await writeFile(packagedGitAdd, 'git executable')

      await writeFile(join(root, 'outside-target'), 'external target')
      await symlink('../../../../outside-target', sourceExternalLink)
      await writeFile(packagedExternalLink, 'external target')

      const restored = restoreGitCoreSymlinks(sourceApp, packagedApp)

      assert.equal(restored, 1)
      assert.equal(
        (await lstat(packagedGitAdd)).isSymbolicLink(),
        true
      )
      assert.equal(await readlink(packagedGitAdd), target)
      assert.equal(
        await readFile(packagedGitAdd, 'utf8'),
        'git executable'
      )
      assert.equal((await lstat(packagedExternalLink)).isFile(), true)
      assert.equal(
        await readFile(packagedExternalLink, 'utf8'),
        'external target'
      )
      assert.equal((await lstat(sourceGitAdd)).isSymbolicLink(), true)
    })
  }
)
