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
  it('refuses a substituted selected-path symlink ancestor before local acceptance', async t => {
    const repository = await seed(t, { 'directory/selected': 'before\n' })
    await writeFile(join(repository.path, 'directory', 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    const saved = join(await createTempDirectory(t), 'saved')
    const parent = join(repository.path, 'directory')
    await rename(parent, saved)
    await symlink(saved, parent, __WIN32__ ? 'junction' : 'dir')
    await assert.rejects(
      acceptVerifiedAssistedCommitTransaction(result, () =>
        assert.fail('Must not accept')
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(parent, 'selected'), 'utf8'),
      'after\n'
    )
  })

  it('keeps rollback available when cancellation wins before local acceptance', async t => {
    const repository = await seed(t, { selected: 'before\n' })
    await writeFile(join(repository.path, 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      acceptVerifiedAssistedCommitTransaction(
        result,
        () => assert.fail('Must not accept'),
        { signal: controller.signal }
      ),
      error =>
        error instanceof AssistedCommitError && error.code === 'cancelled'
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 1)
  })

  it('verifies selected content before acceptance instead of finalizing unchecked output', async t => {
    const repository = await seed(t, { selected: 'before\n' })
    await writeFile(join(repository.path, 'selected'), 'after\n')
    const result = await single(repository, await request(repository))
    await writeFile(join(repository.path, 'selected'), 'external edit\n')
    await assert.rejects(
      acceptVerifiedAssistedCommitTransaction(result, () =>
        assert.fail('Must not accept')
      ),
      error =>
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
    )
    await rollbackAssistedCommitTransaction(result)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'selected'), 'utf8'),
      'external edit\n'
    )
  })

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
