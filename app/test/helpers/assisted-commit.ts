import assert from 'node:assert'
import { TestContext } from 'node:test'
import { exec, IGitExecutionOptions } from 'dugite'
import { chmod, mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import {
  createSingleAssistedCommitPlan,
  executeAssistedCommitPlan,
  IAssistedCommitExecutionOptions,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../src/lib/git/assisted-commit'
import { IAssistedCommitSnapshot } from '../../src/models/assisted-commit'
import { ICopilotAssistedCommitRequest } from '../../src/models/copilot-assisted-commit'
import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from './repositories'
import { getStatusOrThrow } from './status'

export async function rawGit(
  repository: Repository,
  args: string[],
  options?: IGitExecutionOptions
): Promise<string> {
  const result = await exec(args, repository.path, options)
  assert.strictEqual(result.exitCode, 0, result.stderr.toString())
  return result.stdout.toString().replace(/\r?\n$/, '')
}

export async function tip(repository: Repository): Promise<string> {
  const sha = await rawGit(repository, ['rev-parse', '--verify', 'HEAD'])
  assert.match(sha, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
  return sha
}

export async function count(repository: Repository): Promise<number> {
  const result = await exec(
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
    repository.path
  )
  if (result.exitCode === 1) {
    return 0
  }
  assert.strictEqual(result.exitCode, 0)
  return Number(await rawGit(repository, ['rev-list', '--count', 'HEAD', '--']))
}

export async function indexPath(repository: Repository): Promise<string> {
  return rawGit(repository, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'index',
  ])
}

export async function optionalBytes(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (error) {
    assert.ok(
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    )
    return null
  }
}

export async function commitBytes(
  repository: Repository,
  sha: string,
  path: string
): Promise<Buffer | null> {
  const entry = await rawGit(repository, ['ls-tree', '-z', sha, '--', path], {
    env: { GIT_LITERAL_PATHSPECS: '1' },
  })
  if (entry.length === 0) {
    return null
  }
  const oid = entry.slice(0, entry.indexOf('\t')).split(' ')[2]
  const result = await exec(['cat-file', 'blob', oid], repository.path, {
    encoding: 'buffer',
  })
  assert.strictEqual(result.exitCode, 0, result.stderr.toString())
  return result.stdout
}

export async function seed(
  t: TestContext,
  entries: Readonly<Record<string, string | Buffer>>
): Promise<Repository> {
  const repository = await setupEmptyRepository(t)
  for (const [path, bytes] of Object.entries(entries)) {
    await mkdir(dirname(join(repository.path, path)), { recursive: true })
    await writeFile(join(repository.path, path), bytes)
  }
  await rawGit(repository, ['add', '--', ...Object.keys(entries)])
  await rawGit(repository, ['commit', '-m', 'Initial commit'])
  return repository
}

export async function request(
  repository: Repository,
  selected?: ReadonlyArray<string>,
  overrides: Partial<ICopilotAssistedCommitRequest> = {}
): Promise<ICopilotAssistedCommitRequest> {
  const status = await getStatusOrThrow(repository)
  return {
    files: status.workingDirectory.files
      .filter(f => selected === undefined || selected.includes(f.path))
      .map(f => f.withIncludeAll(true)),
    trailers: [],
    skipCommitHooks: false,
    signOffCommits: false,
    allowEmptyCommit: false,
    ...overrides,
  }
}

export async function single(
  repository: Repository,
  input: ICopilotAssistedCommitRequest,
  options: IAssistedCommitExecutionOptions = {}
) {
  return withAssistedCommitSnapshot(
    repository,
    input,
    async snapshot => {
      const plan = createSingleAssistedCommitPlan(snapshot, {
        reason:
          snapshot.analysis.changes.length === 0
            ? 'empty-selection'
            : 'uncertain-boundaries',
        title: 'Commit the entire selected change',
        description: 'Frozen selection only',
      })
      const validated = await validateAssistedCommitPlan(
        snapshot,
        plan,
        options
      )
      return executeAssistedCommitPlan(snapshot, validated, options)
    },
    options
  )
}

export function splitPlan(snapshot: IAssistedCommitSnapshot, reverse = false) {
  const changes = reverse
    ? [...snapshot.analysis.changes].reverse()
    : snapshot.analysis.changes
  return {
    snapshotId: snapshot.id,
    commits: changes.map((change, index) => ({
      title: `Selected unit ${index + 1}`,
      changeIds: [change.id],
    })),
  }
}

export async function writeHook(
  repository: Repository,
  name: string,
  body: string
): Promise<void> {
  const hooks = await rawGit(repository, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'hooks',
  ])
  await mkdir(hooks, { recursive: true })
  const path = join(hooks, name)
  await writeFile(path, `#!/bin/sh\nset -eu\n${body}\n`)
  await chmod(path, 0o755)
}
