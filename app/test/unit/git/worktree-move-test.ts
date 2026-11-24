import assert from 'node:assert'
import * as Path from 'path'
import { realpath } from 'fs/promises'
import {
  before,
  beforeEach,
  describe,
  it,
  mock,
  type TestContext,
} from 'node:test'
import * as dugite from 'dugite'
import { pathExists } from '../../../src/lib/path-exists'
import { Repository } from '../../../src/models/repository'

type ExecArgs = Parameters<typeof dugite.exec>

const execCalls = new Array<{ args: ReadonlyArray<string>; path: string }>()

// Wrap dugite's exec so that we can record which working directory each git
// invocation ran in while still running the real git command.
const exec = (...[args, path, options]: ExecArgs) => {
  execCalls.push({ args, path })
  return dugite.exec(args, path, options)
}

let moveWorktree: typeof import('../../../src/lib/git/worktree').moveWorktree
let setupEmptyRepository: typeof import('../../helpers/repositories').setupEmptyRepository
let makeCommit: typeof import('../../helpers/repository-scaffolding').makeCommit

before(async () => {
  mock.module('dugite', { namedExports: { ...dugite, exec } })
  ;({ moveWorktree } = await import('../../../src/lib/git/worktree'))
  ;({ setupEmptyRepository } = await import('../../helpers/repositories'))
  ;({ makeCommit } = await import('../../helpers/repository-scaffolding'))
})

beforeEach(() => {
  execCalls.length = 0
})

function isInside(parent: string, child: string) {
  const relative = Path.relative(parent, child)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !Path.isAbsolute(relative))
  )
}

/** Asserts that `git worktree move` didn't run from within the moved path */
function assertMoveNotRunFrom(worktreePath: string) {
  const moves = execCalls.filter(
    c => c.args[0] === 'worktree' && c.args[1] === 'move'
  )
  assert.strictEqual(moves.length, 1)
  assert(
    !isInside(Path.resolve(worktreePath), Path.resolve(moves[0].path)),
    `git worktree move ran from inside the moved worktree (${moves[0].path})`
  )
}

async function setupWorktree(t: TestContext) {
  const repo = await setupEmptyRepository(t, 'main')
  await makeCommit(repo, { entries: [{ path: 'README', contents: 'hello' }] })

  const mainPath = await realpath(repo.path)
  const worktreePath = `${mainPath}-wt-a`
  await dugite.exec(
    ['worktree', 'add', '-b', 'feature-a', '--', worktreePath],
    mainPath
  )

  return { repo, mainPath, worktreePath }
}

async function listedWorktreePaths(repositoryPath: string) {
  const { stdout } = await dugite.exec(
    ['worktree', 'list', '--porcelain'],
    repositoryPath
  )
  return stdout
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => Path.normalize(l.substring('worktree '.length)))
}

describe('git/worktree moveWorktree', () => {
  it('renames the linked worktree the repository points to', async t => {
    const { mainPath, worktreePath } = await setupWorktree(t)
    const newPath = `${mainPath}-wt-renamed`
    const repository = new Repository(worktreePath, -1, null, false)

    await moveWorktree(repository, worktreePath, newPath)

    assertMoveNotRunFrom(worktreePath)
    assert.strictEqual(await pathExists(worktreePath), false)
    assert.strictEqual(await pathExists(newPath), true)
    assert.deepStrictEqual(await listedWorktreePaths(mainPath), [
      Path.normalize(mainPath),
      Path.normalize(newPath),
    ])
  })

  it('renames another linked worktree from the main worktree', async t => {
    const { repo, mainPath, worktreePath } = await setupWorktree(t)
    const newPath = `${mainPath}-wt-renamed`

    await moveWorktree(repo, worktreePath, newPath)

    assertMoveNotRunFrom(worktreePath)
    assert.strictEqual(await pathExists(worktreePath), false)
    assert.strictEqual(await pathExists(newPath), true)
    assert.deepStrictEqual(await listedWorktreePaths(mainPath), [
      Path.normalize(mainPath),
      Path.normalize(newPath),
    ])
  })

  it('renames a linked worktree from a sibling linked worktree', async t => {
    const { mainPath, worktreePath } = await setupWorktree(t)
    const siblingPath = `${mainPath}-wt-b`
    await dugite.exec(
      ['worktree', 'add', '-b', 'feature-b', '--', siblingPath],
      mainPath
    )
    const newPath = `${mainPath}-wt-renamed`
    const repository = new Repository(siblingPath, -1, null, false)

    await moveWorktree(repository, worktreePath, newPath)

    assertMoveNotRunFrom(worktreePath)
    assert.strictEqual(await pathExists(newPath), true)
    assert.strictEqual(await pathExists(worktreePath), false)
  })
})
