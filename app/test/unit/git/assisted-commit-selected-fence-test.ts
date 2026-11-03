import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import { join } from 'path'

let transactions: typeof import('../../../src/lib/git/assisted-commit')
let fixtures: typeof import('../../helpers/assisted-commit')
let beforeRead:
  | ((path: Parameters<typeof FileSystem.readFile>[0]) => Promise<void>)
  | undefined
let afterStat:
  | ((path: Parameters<typeof FileSystem.lstat>[0]) => Promise<void>)
  | undefined

before(async () => {
  const read = FileSystem.readFile
  const stat = FileSystem.lstat
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      readFile: async (...args: Parameters<typeof FileSystem.readFile>) => {
        await beforeRead?.(args[0])
        return read(...args)
      },
      lstat: async (...args: Parameters<typeof FileSystem.lstat>) => {
        const result = await stat(...args)
        await afterStat?.(args[0])
        return result
      },
    },
  })
  ;[transactions, fixtures] = await Promise.all([
    import('../../../src/lib/git/assisted-commit'),
    import('../../helpers/assisted-commit'),
  ])
})

describe('assisted selected-file completion fence', () => {
  it('rejects an earlier selected file changed while a later file is being verified', async t => {
    const repository = await fixtures.seed(t, {
      a: 'before a\n',
      b: 'before b\n',
    })
    await FileSystem.writeFile(join(repository.path, 'a'), 'selected a\n')
    await FileSystem.writeFile(join(repository.path, 'b'), 'selected b\n')
    const index = await fixtures.optionalBytes(
      await fixtures.indexPath(repository)
    )
    const result = await fixtures.single(
      repository,
      await fixtures.request(repository, ['a', 'b'])
    )
    let recovered = false
    t.after(async () => {
      beforeRead = undefined
      if (!recovered) {
        await transactions.rollbackAssistedCommitTransaction(result)
      }
    })
    let changed = false
    beforeRead = async path => {
      if (path === join(result.snapshot.repositoryPath, 'b') && !changed) {
        changed = true
        await FileSystem.writeFile(
          join(repository.path, 'a'),
          'new current a\n'
        )
      }
    }
    let accepted = false
    await assert.rejects(
      transactions.acceptVerifiedAssistedCommitTransaction(result, () => {
        accepted = true
      }),
      error =>
        error instanceof transactions.AssistedCommitError &&
        error.code === 'selection-changed'
    )
    assert.strictEqual(changed, true)
    assert.strictEqual(accepted, false)
    await transactions.rollbackAssistedCommitTransaction(result)
    recovered = true
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.deepStrictEqual(
      await fixtures.optionalBytes(await fixtures.indexPath(repository)),
      index
    )
    assert.strictEqual(
      await FileSystem.readFile(join(repository.path, 'a'), 'utf8'),
      'new current a\n'
    )
    assert.strictEqual(
      await FileSystem.readFile(join(repository.path, 'b'), 'utf8'),
      'selected b\n'
    )
  })

  it('keeps earlier metadata samples current through the non-yielding acceptance boundary', async t => {
    const repository = await fixtures.seed(t, {
      a: 'before a\n',
      b: 'before b\n',
    })
    await FileSystem.writeFile(join(repository.path, 'a'), 'selected a\n')
    await FileSystem.writeFile(join(repository.path, 'b'), 'selected b\n')
    const result = await fixtures.single(
      repository,
      await fixtures.request(repository, ['a', 'b'])
    )
    let recovered = false
    t.after(async () => {
      beforeRead = undefined
      afterStat = undefined
      if (!recovered) {
        await transactions.rollbackAssistedCommitTransaction(result)
      }
    })
    const a = join(result.snapshot.repositoryPath, 'a')
    const b = join(result.snapshot.repositoryPath, 'b')
    let aSamples = 0
    let bSamples = 0
    let changed = false
    let completedA: () => void = () => {}
    const sampledA = new Promise<void>(resolve => {
      completedA = resolve
    })
    afterStat = async path => {
      if (path === a && ++aSamples === 3) {
        completedA()
      }
      if (path === b && ++bSamples === 3) {
        await sampledA
        changed = true
        await FileSystem.writeFile(a, 'late current a\n')
      }
    }
    let accepted = false
    await assert.rejects(
      transactions.acceptVerifiedAssistedCommitTransaction(result, () => {
        accepted = true
      }),
      error =>
        error instanceof transactions.AssistedCommitError &&
        error.code === 'selection-changed'
    )
    assert.strictEqual(changed, true)
    assert.strictEqual(accepted, false)
    afterStat = undefined
    await transactions.rollbackAssistedCommitTransaction(result)
    recovered = true
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.strictEqual(await FileSystem.readFile(a, 'utf8'), 'late current a\n')
  })
})
