import { setupEmptyRepository } from './repositories'
import { makeCommit, switchTo } from './repository-scaffolding'
import { GitProcess } from 'dugite'

export async function createRepository() {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [
      { path: 'foo', contents: '' },
      { path: 'perlin', contents: 'perlin' },
    ],
  }

  await makeCommit(repo, firstCommit)

  await switchTo(repo, 'other-branch')

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  const thirdCommit = {
    entries: [{ path: 'foo', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  await switchTo(repo, 'master')

  await GitProcess.exec(['merge', 'other-branch'], repo.path)

  // clear reflog of all entries, so any branches are considered candidates for pruning
  await GitProcess.exec(
    ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all'],
    repo.path
  )

  return repo.path
}
