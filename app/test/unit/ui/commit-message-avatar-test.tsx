import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import { CommitMessageAvatar } from '../../../src/ui/changes/commit-message-avatar'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { git } from '../../../src/lib/git'

const account = { login: 'alice', endpoint: 'https://api.github.com' }
const EditIdentityLabel = __DARWIN__
  ? 'Edit Account Identity'
  : 'Edit account identity'

function props(): React.ComponentProps<typeof CommitMessageAvatar> {
  return {
    repository: new Repository('/tmp/avatar-test', 1, null, false),
    user: {
      name: 'Alice',
      email: 'custom@example.com',
      endpoint: account.endpoint,
      avatarURL: undefined,
    },
    email: 'custom@example.com',
    warningType: 'none',
    branch: 'main',
    isEnterpriseAccount: false,
    accountEmails: ['1+alice@users.noreply.github.com'],
    preferredAccountEmail: '1+alice@users.noreply.github.com',
    onUpdateEmail: () => {},
    onOpenRepositorySettings: () => {},
    onOpenGitSettings: () => {},
    accounts: [],
    managedAccount: account,
    managedAccountSignedOut: false,
  }
}

describe('managed commit author popover', () => {
  it('switches from local Git settings to account preferences without using the old config location', async t => {
    const repository = await setupEmptyRepository(t)
    await git(
      ['config', '--local', 'user.email', 'local@example.com'],
      repository.path,
      'setLocalEmail'
    )
    let opened = ''
    const initial = {
      ...props(),
      repository,
      onOpenGitSettings: () => {
        opened = 'preferences'
      },
      onOpenRepositorySettings: () => {
        opened = 'repository'
      },
    }
    const view = render(
      <CommitMessageAvatar {...initial} managedAccount={undefined} />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'View commit author information' })
    )
    await waitFor(() =>
      assert.ok(screen.getByText(/update your local git configuration/))
    )
    view.rerender(<CommitMessageAvatar {...initial} />)
    fireEvent.click(screen.getByRole('button', { name: EditIdentityLabel }))
    assert.equal(opened, 'preferences')
  })

  it('describes the account identity and opens its preferences instead of Git config', () => {
    let opened = false
    render(
      <CommitMessageAvatar
        {...props()}
        onOpenGitSettings={() => {
          opened = true
        }}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'View commit author information' })
    )
    assert.ok(screen.getByText(/assigned account @alice on GitHub.com/))
    assert.ok(screen.getByText(/other repositories assigned to this account/))
    assert.equal(screen.queryByText(/local git configuration/), null)
    assert.equal(
      screen.queryByRole('button', { name: 'repository settings' }),
      null
    )
    fireEvent.click(screen.getByRole('button', { name: EditIdentityLabel }))
    assert.equal(opened, true)
  })

  it('keeps misattribution warnings and updates the managed identity', () => {
    let email = ''
    render(
      <CommitMessageAvatar
        {...props()}
        warningType="misattribution"
        onUpdateEmail={value => {
          email = value
        }}
      />
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Commit may be misattributed. View warning.',
      })
    )
    assert.ok(screen.getByText(/account's managed commit identity/))
    assert.ok(screen.getByText(/other repositories assigned to this account/))
    assert.equal(screen.queryByText(/global Git config/), null)
    assert.equal(screen.queryByText(/choose an email local/), null)
    fireEvent.click(screen.getByRole('button', { name: /Update [Ee]mail/ }))
    assert.equal(email, '1+alice@users.noreply.github.com')
  })

  it('explains that attribution is unknown after sign-out without offering stale email choices', () => {
    render(
      <CommitMessageAvatar
        {...props()}
        accountEmails={[]}
        preferredAccountEmail=""
        managedAccountSignedOut={true}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'View commit author information' })
    )
    assert.ok(screen.getByText(/Sign in to check whether this email/))
    assert.ok(screen.getByText(/continues using the saved identity/))
    assert.equal(screen.queryByRole('combobox'), null)
  })

  it('drops an email selection that belongs to the previously assigned account', () => {
    let email = ''
    const initial = {
      ...props(),
      warningType: 'misattribution' as const,
      accountEmails: ['alice@example.com', 'other-alice@example.com'],
      preferredAccountEmail: 'alice@example.com',
      onUpdateEmail: (value: string) => {
        email = value
      },
    }
    const view = render(<CommitMessageAvatar {...initial} />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Commit may be misattributed. View warning.',
      })
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Your Account Emails' }),
      {
        target: { value: 'other-alice@example.com' },
      }
    )
    view.rerender(
      <CommitMessageAvatar
        {...initial}
        managedAccount={{ ...account, login: 'bob' }}
        accountEmails={['bob@example.com']}
        preferredAccountEmail="bob@example.com"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Update [Ee]mail/ }))
    assert.equal(email, 'bob@example.com')
  })
})
