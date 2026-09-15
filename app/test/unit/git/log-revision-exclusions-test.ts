import assert from 'node:assert'
import { it } from 'node:test'
import { exec } from 'dugite'
import { getCommits } from '../../../src/lib/git/log'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

it('getCommits preserves revision inclusion when additional arguments exclude remotes', async t => {
  const repository = await setupEmptyRepository(t)
  const runGit = async (args: string[]) => {
    const result = await exec(args, repository.path)
    assert.strictEqual(result.exitCode, 0, result.stderr)
    return result.stdout.trim()
  }
  await makeCommit(repository, {
    entries: [{ path: 'file.txt', contents: 'shared\n' }],
    commitMessage: 'shared',
  })
  await runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  await runGit(['update-ref', 'refs/remotes/--remote/base', 'HEAD'])
  await makeCommit(repository, {
    entries: [{ path: 'file.txt', contents: 'first\n' }],
    commitMessage: 'local first',
  })
  const first = await runGit(['rev-parse', 'HEAD'])
  await makeCommit(repository, {
    entries: [{ path: 'file.txt', contents: 'second\n' }],
    commitMessage: 'local second',
  })
  const second = await runGit(['rev-parse', 'HEAD'])
  await runGit(['update-ref', 'refs/heads/--local', 'HEAD'])

  for (const revision of ['HEAD', '--local', '--remote/base..HEAD']) {
    for (const additionalArgs of [
      ['--not', '--remotes'],
      ['--not', '--remotes=origin'],
      ['--not', '--remotes=origin', '--not', '--tags'],
    ]) {
      const commits = await getCommits(
        repository,
        revision,
        undefined,
        undefined,
        additionalArgs
      )
      assert.deepStrictEqual(
        commits.map(c => ({ sha: c.sha, summary: c.summary })),
        [
          { sha: second, summary: 'local second' },
          { sha: first, summary: 'local first' },
        ]
      )
    }
    const paginated = await getCommits(repository, revision, 1, 1, [
      '--grep=local',
      '--not',
      '--remotes=origin',
    ])
    assert.deepStrictEqual(
      paginated.map(c => c.sha),
      [first]
    )
  }
})
