/* eslint-disable no-sync */
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { existsSync } from 'fs'
import { readFile, rename, stat, symlink, utimes, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  acceptVerifiedAssistedCommitTransaction,
  rollbackAssistedCommitTransaction,
  AssistedCommitError,
  prepareAssistedCommitTransactionForPush,
} from '../../../src/lib/git/assisted-commit'
import {
  seed,
  request,
  single,
  indexPath,
  count,
} from '../../helpers/assisted-commit'
import { createTempDirectory } from '../../helpers/temp'

describe('assisted local completion fence', () => {
  it('restores the original index timestamp so native racy-stat entries cannot become falsely clean', async t => {
    const repository = await seed(t, { selected: 'before\n' })
    await writeFile(join(repository.path, 'selected'), 'AFTER!\n')
    const input = await request(repository)
    const index = await indexPath(repository)
    const originalTime = new Date('2010-01-01T00:00:00Z')
    await utimes(index, originalTime, originalTime)
    const result = await single(repository, input)
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(
      Math.floor((await stat(index)).mtimeMs / 1000),
      originalTime.getTime() / 1000
    )
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'selected'), 'utf8'),
      'AFTER!\n'
    )
  })

  it('refuses a new selected-path symlink ancestor even when leaf inode, bytes and versions still match', async t => {
    const repository = await seed(t, { 'directory/selected': 'before\n' })
    await writeFile(join(repository.path, 'directory', 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    const enter = await prepareAssistedCommitTransactionForPush(
      result,
      async () => () => {}
    )
    const saved = join(await createTempDirectory(t), 'saved')
    const parent = join(repository.path, 'directory')
    await rename(parent, saved)
    await symlink(saved, parent, __WIN32__ ? 'junction' : 'dir')
    assert.throws(
      enter,
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'unsafe-selection'
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(parent, 'selected'), 'utf8'),
      'after\n'
    )
  })

  it('keeps the result reversible through native pre-push fences and their cleanup', async t => {
    const repository = await seed(t, { selected: 'before\n' })
    await writeFile(join(repository.path, 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    const controller = new AbortController()
    const index = await indexPath(repository)
    const enter = await prepareAssistedCommitTransactionForPush(
      result,
      async () => {
        assert.ok(existsSync(`${index}.lock`))
        assert.ok(existsSync(join(repository.path, '.git', 'HEAD.lock')))
        assert.ok(
          existsSync(
            join(repository.path, '.git', 'refs', 'heads', 'master.lock')
          )
        )
        return () => {}
      },
      { signal: controller.signal }
    )
    assert.strictEqual(existsSync(`${index}.lock`), false)
    assert.strictEqual(
      existsSync(join(repository.path, '.git', 'HEAD.lock')),
      false
    )
    controller.abort()
    assert.throws(
      enter,
      error =>
        error instanceof AssistedCommitError && error.code === 'cancelled'
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'selected'), 'utf8'),
      'after\n'
    )
  })

  it('finalizes only at the one-shot push entry and retains no destructive result afterwards', async t => {
    const repository = await seed(t, { selected: 'before\n' })
    await writeFile(join(repository.path, 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    const enter = await prepareAssistedCommitTransactionForPush(
      result,
      async () => () => {}
    )
    enter()
    assert.throws(
      enter,
      error => error instanceof AssistedCommitError && error.code === 'disposed'
    )
    await assert.rejects(
      rollbackAssistedCommitTransaction(result),
      error => error instanceof AssistedCommitError && error.code === 'disposed'
    )
    assert.strictEqual(await count(repository), 2)
  })

  it('rejects selected backing changes in the non-yielding spawn check before disposing rollback', async t => {
    const repository = await seed(t, { selected: 'before\n' })
    await writeFile(join(repository.path, 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    const enter = await prepareAssistedCommitTransactionForPush(
      result,
      async () => () => {}
    )
    await writeFile(join(repository.path, 'selected'), 'changed before spawn\n')
    assert.throws(
      enter,
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'selected'), 'utf8'),
      'changed before spawn\n'
    )
  })

  it('accepts synchronously only while real HEAD, branch and index locks are held', async t => {
    const repository = await seed(t, {
      selected: 'before\n',
      other: 'before other\n',
    })
    await writeFile(join(repository.path, 'selected'), 'selected\n')
    const result = await single(
      repository,
      await request(repository, ['selected'])
    )
    const index = await indexPath(repository)
    let accepted = false
    await acceptVerifiedAssistedCommitTransaction(result, () => {
      assert.ok(existsSync(`${index}.lock`))
      assert.ok(existsSync(join(repository.path, '.git', 'HEAD.lock')))
      assert.ok(
        existsSync(
          join(repository.path, '.git', 'refs', 'heads', 'master.lock')
        )
      )
      accepted = true
    })
    assert.strictEqual(accepted, true)
    assert.strictEqual(existsSync(`${index}.lock`), false)
    assert.strictEqual(
      existsSync(join(repository.path, '.git', 'HEAD.lock')),
      false
    )
    await assert.rejects(
      rollbackAssistedCommitTransaction(result),
      error => error instanceof AssistedCommitError && error.code === 'disposed'
    )
  })
})
