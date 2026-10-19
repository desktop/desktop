import assert from 'node:assert'
import { describe, it } from 'node:test'
import { CloneInfoLookup, resolveURLCloneInfo } from '../../src/lib/clone-info'
import { getDotComAPIEndpoint, getEnterpriseAPIURL } from '../../src/lib/api'
import { Account } from '../../src/models/account'

const dotCom = getDotComAPIEndpoint()
const enterprise = getEnterpriseAPIURL('https://ghe.example.com')
const alice = new Account('alice', dotCom, 'alice-token', [], '', 1, '')
const bob = new Account('bob', dotCom, 'bob-token', [], '', 2, '')
const carol = new Account('carol', enterprise, 'carol-token', [], '', 3, '')

/** A lookup where only the given logins (with '' meaning anonymous) have access. */
function createLookup(withAccess: ReadonlyArray<string>) {
  const calls = new Array<string>()
  const lookup: CloneInfoLookup = async (account, owner, name, protocol) => {
    calls.push(account.login)
    if (!withAccess.includes(account.login)) {
      return null
    }
    const host =
      account.endpoint === enterprise ? 'ghe.example.com' : 'github.com'
    return {
      url:
        protocol === 'ssh'
          ? `git@${host}:${owner}/${name}.git`
          : `https://${host}/${owner}/${name}.git`,
      defaultBranch: 'main',
    }
  }
  return { lookup, calls }
}

describe('resolveURLCloneInfo', () => {
  it('uses the account on the URL host that can access the repository', async () => {
    const { lookup, calls } = createLookup(['bob'])
    const info = await resolveURLCloneInfo(
      'https://github.com/owner/repo',
      [carol, alice, bob],
      lookup
    )
    assert.deepStrictEqual(info, {
      url: 'https://github.com/owner/repo.git',
      defaultBranch: 'main',
    })
    assert.deepStrictEqual(calls, ['alice', 'bob'])
  })

  it("preserves an SSH URL's protocol", async () => {
    const { lookup } = createLookup(['bob'])
    const info = await resolveURLCloneInfo(
      'git@github.com:owner/repo.git',
      [alice, bob],
      lookup
    )
    assert.strictEqual(info?.url, 'git@github.com:owner/repo.git')
  })

  it('falls back to anonymous access for public GitHub.com repositories', async () => {
    const { lookup, calls } = createLookup([''])
    const info = await resolveURLCloneInfo(
      'https://github.com/owner/repo',
      [alice],
      lookup
    )
    assert.strictEqual(info?.url, 'https://github.com/owner/repo.git')
    assert.deepStrictEqual(calls, ['alice', ''])
  })

  it('clones an SSH URL as entered when no account can access it', async () => {
    const url = 'git@github.com:owner/private.git'
    const { lookup } = createLookup([])
    assert.deepStrictEqual(await resolveURLCloneInfo(url, [alice], lookup), {
      url,
    })
    assert.deepStrictEqual(await resolveURLCloneInfo(url, [], lookup), { url })
  })

  it('fails an HTTPS URL when no account can access it', async () => {
    const { lookup } = createLookup([])
    assert.strictEqual(
      await resolveURLCloneInfo(
        'https://github.com/owner/private',
        [alice, bob],
        lookup
      ),
      null
    )
    assert.strictEqual(
      await resolveURLCloneInfo(
        'https://ghe.example.com/owner/private',
        [carol],
        lookup
      ),
      null
    )
  })

  it('clones URLs for hosts without a signed-in account as entered', async () => {
    const { lookup, calls } = createLookup([])
    const url = 'https://gitlab.com/owner/repo.git'
    assert.deepStrictEqual(await resolveURLCloneInfo(url, [alice], lookup), {
      url,
    })
    const enterpriseURL = 'git@ghe.other.com:owner/repo.git'
    assert.deepStrictEqual(
      await resolveURLCloneInfo(enterpriseURL, [carol], lookup),
      { url: enterpriseURL }
    )
    assert.deepStrictEqual(calls, [])
  })

  it('clones as entered when a lookup fails', async () => {
    const url = 'https://github.com/owner/repo'
    const lookup: CloneInfoLookup = async () => {
      throw new Error('offline')
    }
    assert.deepStrictEqual(await resolveURLCloneInfo(url, [alice], lookup), {
      url,
    })
  })
})
