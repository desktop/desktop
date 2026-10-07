/* eslint-disable no-sync */
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import {
  acceptVerifiedAssistedCommitTransaction,
  rollbackAssistedCommitTransaction,
  AssistedCommitError,
} from '../../../src/lib/git/assisted-commit'
import { seed, request, single, indexPath } from '../../helpers/assisted-commit'

describe('assisted local completion fence', () => {
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
