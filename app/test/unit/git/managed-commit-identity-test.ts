import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { git } from '../../../src/lib/git/core'
import { createCommit } from '../../../src/lib/git/commit'
import { getAuthorIdentity } from '../../../src/lib/git/var'
import { setCommitIdentityProvider } from '../../../src/lib/managed-commit-identity'
import { setupEmptyRepository } from '../../helpers/repositories'
import { rawGit, request, seed, splitPlan } from '../../helpers/assisted-commit'
import {
  executeAssistedCommitPlan,
  getAssistedCommitExecutionMetadata,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'

const managed = { name: 'Managed author', email: 'managed@example.com' }
const originalEnv = {
  GIT_AUTHOR_NAME: 'Original author',
  GIT_AUTHOR_EMAIL: 'original@example.com',
  GIT_COMMITTER_NAME: 'Original committer',
  GIT_COMMITTER_EMAIL: 'original-committer@example.com',
}

describe('Desktop-only Git authorship', () => {
  afterEach(() => setCommitIdentityProvider(() => undefined))

  it('isolates repositories and leaves native config and external Git untouched', async t => {
    const first = await setupEmptyRepository(t)
    const second = await setupEmptyRepository(t)
    const configPath = join(first.path, '.git', 'config')
    const config = await readFile(configPath)
    setCommitIdentityProvider(path =>
      path === first.path ? managed : undefined
    )
    const outside = await exec(['var', 'GIT_AUTHOR_IDENT'], first.path)
    const [author, other] = await Promise.all([
      getAuthorIdentity(first),
      getAuthorIdentity(second),
    ])
    assert.equal(author?.name, managed.name)
    assert.equal(author?.email, managed.email)
    assert.notEqual(other?.email, managed.email)
    assert.ok(!outside.stdout.includes(managed.email))
    await createCommit(first, 'Managed commit', [], {
      allowEmpty: true,
      signOff: true,
    })
    assert.equal(
      await rawGit(first, [
        'show',
        '-s',
        '--format=%an <%ae>|%cn <%ce>',
        'HEAD',
      ]),
      'Managed author <managed@example.com>|Managed author <managed@example.com>'
    )
    assert.match(
      await rawGit(first, ['show', '-s', '--format=%B', 'HEAD']),
      /Signed-off-by: Managed author <managed@example.com>/
    )
    assert.deepEqual(await readFile(configPath), config)
  })

  it('preserves the original author on amend, cherry-pick, and rebase', async t => {
    const repository = await setupEmptyRepository(t)
    await rawGit(repository, ['commit', '--allow-empty', '-m', 'Original'], {
      env: originalEnv,
    })
    await rawGit(repository, ['branch', 'base'])
    setCommitIdentityProvider(path =>
      path === repository.path ? managed : undefined
    )
    await createCommit(repository, 'Amended', [], {
      amend: true,
      allowEmpty: true,
    })
    assert.equal(
      await rawGit(repository, [
        'show',
        '-s',
        '--format=%an|%ae|%cn|%ce',
        'HEAD',
      ]),
      'Original author|original@example.com|Managed author|managed@example.com'
    )
    await rawGit(repository, ['checkout', '-b', 'source', 'base'])
    await writeFile(join(repository.path, 'picked'), 'picked\n')
    await rawGit(repository, ['add', '--', 'picked'])
    await rawGit(repository, ['commit', '-m', 'Picked'], { env: originalEnv })
    const picked = await rawGit(repository, ['rev-parse', 'HEAD'])
    await rawGit(repository, ['checkout', '-b', 'target', 'base'])
    await git(['cherry-pick', picked], repository.path, 'managedCherryPick')
    assert.equal(
      await rawGit(repository, [
        'show',
        '-s',
        '--format=%an|%ae|%cn|%ce',
        'HEAD',
      ]),
      'Original author|original@example.com|Managed author|managed@example.com'
    )
    await rawGit(repository, ['checkout', '-b', 'upstream', 'base'])
    await writeFile(join(repository.path, 'upstream'), 'upstream\n')
    await rawGit(repository, ['add', '--', 'upstream'])
    await rawGit(repository, ['commit', '-m', 'Upstream'], { env: originalEnv })
    await rawGit(repository, ['checkout', 'target'])
    await git(['rebase', 'upstream'], repository.path, 'managedRebase')
    assert.equal(
      await rawGit(repository, [
        'show',
        '-s',
        '--format=%an|%ae|%cn|%ce',
        'HEAD',
      ]),
      'Original author|original@example.com|Managed author|managed@example.com'
    )
  })

  it('uses managed identity for merge and revert commits', async t => {
    const repository = await seed(t, { initial: 'initial\n' })
    await rawGit(repository, ['branch', 'base'])
    await rawGit(repository, ['checkout', '-b', 'side'])
    await writeFile(join(repository.path, 'side'), 'side\n')
    await rawGit(repository, ['add', '--', 'side'])
    await rawGit(repository, ['commit', '-m', 'Side'])
    const side = await rawGit(repository, ['rev-parse', 'HEAD'])
    await rawGit(repository, ['checkout', '-b', 'target', 'base'])
    setCommitIdentityProvider(path =>
      path === repository.path ? managed : undefined
    )
    await git(
      ['merge', '--no-ff', '--no-edit', 'side'],
      repository.path,
      'managedMerge'
    )
    assert.equal(
      await rawGit(repository, ['show', '-s', '--format=%ae|%ce', 'HEAD']),
      `${managed.email}|${managed.email}`
    )
    await git(['revert', '--no-edit', side], repository.path, 'managedRevert')
    assert.equal(
      await rawGit(repository, ['show', '-s', '--format=%ae|%ce', 'HEAD']),
      `${managed.email}|${managed.email}`
    )
  })

  it('freezes managed identity for assisted validation and all commits in the run', async t => {
    const repository = await seed(t, { a: 'a\n', b: 'b\n' })
    await writeFile(join(repository.path, 'a'), 'changed a\n')
    await writeFile(join(repository.path, 'b'), 'changed b\n')
    setCommitIdentityProvider(path =>
      path === repository.path ? managed : undefined
    )
    const input = await request(repository, undefined, { signOffCommits: true })
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      setCommitIdentityProvider(() => ({
        name: 'Later author',
        email: 'later@example.com',
      }))
      const checked = await validateAssistedCommitPlan(
        snapshot,
        splitPlan(snapshot)
      )
      const metadata = await getAssistedCommitExecutionMetadata(
        snapshot,
        checked
      )
      assert.equal(metadata.author?.email, managed.email)
      assert.equal(metadata.committer?.email, managed.email)
      const result = await executeAssistedCommitPlan(snapshot, checked)
      for (const sha of result.commits) {
        assert.equal(
          await rawGit(repository, ['show', '-s', '--format=%ae|%ce', sha]),
          `${managed.email}|${managed.email}`
        )
        assert.match(
          await rawGit(repository, ['show', '-s', '--format=%B', sha]),
          /Signed-off-by: Managed author <managed@example.com>/
        )
      }
    })
  })

  it('does not apply a later managed identity to an existing Git-managed assisted run', async t => {
    const repository = await seed(t, { a: 'a\n' })
    await writeFile(join(repository.path, 'a'), 'changed a\n')
    const author = await getAuthorIdentity(repository)
    assert.ok(author)
    await withAssistedCommitSnapshot(
      repository,
      await request(repository),
      async snapshot => {
        setCommitIdentityProvider(() => managed)
        const checked = await validateAssistedCommitPlan(
          snapshot,
          splitPlan(snapshot)
        )
        const metadata = await getAssistedCommitExecutionMetadata(
          snapshot,
          checked
        )
        assert.equal(metadata.author?.email, author.email)
        const result = await executeAssistedCommitPlan(snapshot, checked)
        assert.ok(result.head.sha)
        assert.equal(
          await rawGit(repository, [
            'show',
            '-s',
            '--format=%ae',
            result.head.sha,
          ]),
          author.email
        )
      }
    )
  })
})
