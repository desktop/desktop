import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

describe('Accounts preferences', () => {
  it('shows all accounts on each endpoint and supports adding and signing out individually', () => {
    const accounts = [
      new Account(
        'personal',
        'https://api.github.com',
        'token',
        [],
        '',
        1,
        'Personal'
      ),
      new Account('work', 'https://api.github.com', 'token', [], '', 2, 'Work'),
      new Account(
        'enterprise-one',
        'https://enterprise.example.com/api/v3',
        'token',
        [],
        '',
        1,
        'Enterprise one'
      ),
      new Account(
        'enterprise-two',
        'https://enterprise.example.com/api/v3',
        'token',
        [],
        '',
        2,
        'Enterprise two'
      ),
    ]
    let dotComSignIns = 0
    let enterpriseSignIns = 0
    const signedOut: Account[] = []
    render(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => dotComSignIns++}
        onEnterpriseSignIn={() => enterpriseSignIns++}
        onLogout={account => signedOut.push(account)}
      />
    )

    for (const account of accounts) {
      assert.ok(screen.getByText(`@${account.login}`, { exact: false }))
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub.com account' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Add GitHub Enterprise account' })
    )
    assert.strictEqual(dotComSignIns, 1)
    assert.strictEqual(enterpriseSignIns, 1)

    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    assert.strictEqual(signOutButtons.length, accounts.length)
    fireEvent.click(signOutButtons[1])
    assert.deepStrictEqual(signedOut, [accounts[1]])
  })

  it('groups enterprise accounts by hostname in their own section', () => {
    const enterprise = (login: string, endpoint: string, id: number) =>
      new Account(login, endpoint, 'token', [], '', id, `Name of ${login}`)
    const accounts = [
      new Account(
        'octocat',
        'https://api.github.com',
        'token',
        [],
        '',
        1,
        'The Octocat'
      ),
      enterprise('zeta-one', 'https://zeta.example.com/api/v3', 1),
      enterprise('alpha-one', 'https://alpha.example.com/api/v3', 2),
      enterprise('zeta-two', 'https://zeta.example.com/api/v3', 3),
      enterprise('tenant-one', 'https://api.tenant.ghe.com', 4),
    ]
    const { container } = render(
      <Accounts
        accounts={accounts}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
      />
    )

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map(h => h.textContent)
    assert.deepStrictEqual(headings, [
      'alpha.example.com',
      'tenant.ghe.com',
      'zeta.example.com',
    ])

    const loginsIn = (host: string) =>
      within(screen.getByRole('region', { name: host }))
        .getAllByText(/^@/)
        .map(e => e.textContent)
    assert.deepStrictEqual(loginsIn('alpha.example.com'), ['@alpha-one'])
    assert.deepStrictEqual(loginsIn('tenant.ghe.com'), ['@tenant-one'])
    assert.deepStrictEqual(loginsIn('zeta.example.com'), [
      '@zeta-one',
      '@zeta-two',
    ])

    // Every row shows the name, then the login, and no endpoint or host.
    for (const row of container.querySelectorAll('.account-info')) {
      const lines = [...row.querySelectorAll('.user-info > div')].map(
        e => e.textContent
      )
      const login = row.querySelector('.login')?.textContent?.slice(1)
      const account = accounts.find(a => a.login === login)
      assert.ok(account)
      assert.deepStrictEqual(lines, [account.name, `@${account.login}`])
    }
    assert.strictEqual(screen.queryByText(/https?:\/\//), null)

    // The GitHub.com account is listed before the enterprise heading and
    // isn't part of any hostname group.
    const [dotCom, enterpriseHeading] = screen.getAllByRole('heading', {
      level: 2,
    })
    assert.strictEqual(dotCom.textContent, 'GitHub.com')
    assert.strictEqual(enterpriseHeading.textContent, 'GitHub Enterprise')
    const octocat = screen.getByText('@octocat')
    assert.strictEqual(octocat.closest('section'), null)
    assert.ok(
      enterpriseHeading.compareDocumentPosition(octocat) &
        container.DOCUMENT_POSITION_PRECEDING
    )
  })

  it('keeps Enterprise servers on different ports in separate groups', () => {
    const enterprise = (login: string, endpoint: string, id: number) =>
      new Account(login, endpoint, 'token', [], '', id, login)
    render(
      <Accounts
        accounts={[
          enterprise('default-port', 'https://ghes.example.com/api/v3', 1),
          enterprise('custom-port', 'https://ghes.example.com:8443/api/v3', 2),
        ]}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
      />
    )

    const loginsIn = (host: string) =>
      within(screen.getByRole('region', { name: host }))
        .getAllByText(/^@/)
        .map(e => e.textContent)
    assert.deepStrictEqual(loginsIn('ghes.example.com'), ['@default-port'])
    assert.deepStrictEqual(loginsIn('ghes.example.com:8443'), ['@custom-port'])
  })

  it('shows the original sign-in actions when there are no accounts', () => {
    render(
      <Accounts
        accounts={[]}
        onDotComSignIn={() => {}}
        onEnterpriseSignIn={() => {}}
        onLogout={() => {}}
      />
    )
    assert.ok(screen.getByRole('button', { name: /sign into github.com/i }))
    assert.ok(
      screen.getByRole('button', { name: /sign into github enterprise/i })
    )
  })
})
