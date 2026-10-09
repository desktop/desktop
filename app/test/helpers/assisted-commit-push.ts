import { TestContext } from 'node:test'
import { Repository } from '../../src/models/repository'
import { rawGit, tip } from './assisted-commit'
import { createTempDirectory } from './temp'

/** Local-only bare destination, with explicit --git-dir reads on hardened Git installations. */
export async function addBareRemote(
  t: TestContext,
  repository: Repository,
  options: {
    readonly name?: string
    readonly publish?: boolean
    readonly remoteRef?: string
  } = {}
) {
  const path = await createTempDirectory(t)
  const name = options.name ?? 'origin'
  const branchRef = await rawGit(repository, [
    'symbolic-ref',
    '--quiet',
    'HEAD',
  ])
  const remoteRef = options.remoteRef ?? branchRef
  const originalTip = await tip(repository)
  await rawGit(repository, ['init', '--bare', path])
  await rawGit(repository, ['remote', 'add', '--', name, path])
  if (options.publish !== false) {
    await rawGit(repository, [
      'push',
      '--set-upstream',
      '--',
      name,
      `${branchRef}:${remoteRef}`,
    ])
  }
  const read = (args: string[]) =>
    rawGit(repository, ['--git-dir', path, ...args])
  return {
    path,
    name,
    branchRef,
    remoteRef,
    originalTip,
    read,
    tip: () => read(['rev-parse', '--verify', remoteRef]),
    count: async () =>
      Number(await read(['rev-list', '--count', remoteRef, '--'])),
  }
}
