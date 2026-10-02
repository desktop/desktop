import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { accountForCredential } from '../../src/lib/trampoline/trampoline-credential-helper'

const endpoint = 'https://api.github.com'
const remoteUrl = 'https://github.com/owner/repo.git'
const account = (login: string, id: number) =>
  new Account(login, endpoint, `${login}-token`, [], '', id, login)
const first = account('first', 1)
const second = account('second', 2)
const repository = (
  identity: { readonly endpoint: string; readonly id: number } | null
) =>
  new Repository(
    '/workspace/repo',
    1,
    null,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    identity
  )

describe('accountForCredential', () => {
  it('uses the repository association instead of the first host account', () => {
    assert.strictEqual(
      accountForCredential(
        [first, second],
        [repository(second)],
        '/workspace/repo',
        remoteUrl
      ),
      second
    )
  })

  it('does not use a different account when the associated account is signed out', () => {
    assert.strictEqual(
      accountForCredential(
        [first],
        [repository(second)],
        '/workspace/repo/submodule',
        remoteUrl
      ),
      undefined
    )
  })

  it('does not choose for an unassociated repository', () => {
    assert.strictEqual(
      accountForCredential(
        [first],
        [repository(null)],
        '/workspace/repo',
        remoteUrl
      ),
      undefined
    )
  })

  it('does not leak the associated account to another host', () => {
    assert.strictEqual(
      accountForCredential(
        [first],
        [repository(first)],
        '/workspace/repo',
        'https://other.example.com/owner/repo'
      ),
      undefined
    )
  })

  it('does not choose a first account for a clone with two host accounts', () => {
    assert.strictEqual(
      accountForCredential(
        [first, second],
        [],
        '/workspace/clone-target',
        remoteUrl
      ),
      undefined
    )
  })
})
