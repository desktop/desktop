import assert from 'node:assert'
import { describe, it } from 'node:test'
import { groupAccountsByHost } from '../../src/lib/group-accounts-by-host'
import { Account } from '../../src/models/account'

const account = (login: string, endpoint: string) =>
  new Account(login, endpoint, '', [], '', 1, '')

describe('groupAccountsByHost', () => {
  it('groups by web host, sorted alphabetically, keeping account order', () => {
    const zebraBob = account('bob', 'https://zebra.example.com/api/v3')
    const acme = account('carol', 'https://acme.example.com/api/v3')
    const zebraAlice = account('alice', 'https://zebra.example.com/api/v3')
    const ghe = account('dave', 'https://api.octo.ghe.com')
    const acmePort = account('erin', 'https://acme.example.com:8443/api/v3')

    const groups = groupAccountsByHost([
      zebraBob,
      ghe,
      acmePort,
      acme,
      zebraAlice,
    ])

    assert.deepStrictEqual(groups, [
      ['acme.example.com', [acme]],
      ['acme.example.com:8443', [acmePort]],
      ['octo.ghe.com', [ghe]],
      ['zebra.example.com', [zebraBob, zebraAlice]],
    ])
  })
})
