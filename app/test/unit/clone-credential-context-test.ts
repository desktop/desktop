import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { accountForCredential } from '../../src/lib/trampoline/trampoline-credential-helper'
import {
  getCredentialAccountIdentity,
  withTrampolineEnv,
} from '../../src/lib/trampoline/trampoline-environment'

const endpoint = 'https://api.github.com'
const first = new Account('first', endpoint, 'first-token', [], '', 1, 'First')
const second = new Account(
  'second',
  endpoint,
  'second-token',
  [],
  '',
  2,
  'Second'
)
const selectedIdentity = { endpoint: second.endpoint, id: second.id }
const remoteUrl = 'https://github.com/owner/repo.git'

describe('clone credential context', () => {
  it('selects the chosen account while cloning without a stored repository', () => {
    assert.strictEqual(
      accountForCredential(
        [first, second],
        [],
        '/path/to/git/source',
        remoteUrl,
        [first, second],
        selectedIdentity
      ),
      second
    )
  })

  it('does not use an unrelated stored repository under the Git working directory', () => {
    const existing = new Repository(
      '/path/to/git',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      { endpoint: first.endpoint, id: first.id }
    )
    assert.strictEqual(
      accountForCredential(
        [first, second],
        [existing],
        '/path/to/git/source',
        remoteUrl,
        [first, second],
        selectedIdentity
      ),
      second
    )
  })

  it('never supplies the chosen account to a submodule on another host', () => {
    assert.strictEqual(
      accountForCredential(
        [first, second],
        [],
        '/path/to/git/source',
        'https://enterprise.example.com/owner/repo',
        [first, second],
        selectedIdentity
      ),
      undefined
    )
  })

  it('does not fall back to the sole host account when none was chosen', () => {
    assert.strictEqual(
      accountForCredential(
        [first],
        [],
        '/path/to/git/source',
        remoteUrl,
        [first],
        null
      ),
      undefined
    )
  })

  it('scopes the selected identity to one Git operation', async () => {
    let token = ''
    await withTrampolineEnv(
      async env => {
        token = (env as { DESKTOP_TRAMPOLINE_TOKEN: string })
          .DESKTOP_TRAMPOLINE_TOKEN
        assert.deepStrictEqual(
          getCredentialAccountIdentity(token),
          selectedIdentity
        )
      },
      process.cwd(),
      false,
      undefined,
      selectedIdentity
    )
    assert.strictEqual(getCredentialAccountIdentity(token), undefined)
  })
})
