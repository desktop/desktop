import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { Git } from '../../../src/ui/preferences/git'
import { Account } from '../../../src/models/account'
import { getManagedAuthor } from '../../../src/lib/git/account-authorship'

describe('Git author preferences', () => {
  const account = new Account(
    'alice',
    'https://api.github.com',
    '',
    [],
    '',
    101,
    'Alice Smith'
  )

  it('offers Desktop-managed identities by account without changing Git config fields', () => {
    const changed: string[] = []
    render(
      <Git
        name="Global Git Name"
        email="global@example.com"
        defaultBranch="main"
        isLoadingGitConfig={false}
        accounts={[account]}
        authoringMode="desktop"
        manageExternalAppAuthors={false}
        managedAuthors={new Map()}
        onAuthoringModeChanged={mode => changed.push(mode)}
        onManageExternalAppAuthorsChanged={() => {}}
        onManagedAuthorChanged={() => {}}
        onNameChanged={() => {}}
        onEmailChanged={() => {}}
        onDefaultBranchChanged={() => {}}
        onEditGlobalGitConfig={() => {}}
        onSelectedTabIndexChanged={() => {}}
        onEnableGitHookEnvChanged={() => {}}
        onCacheGitHookEnvChanged={() => {}}
        onSelectedShellChanged={() => {}}
        enableGitHookEnv={false}
        cacheGitHookEnv={true}
        selectedShell="git-bash"
      />
    )
    assert.strictEqual(getManagedAuthor(account).name, 'Alice Smith')
    assert.ok(screen.getByText('Alice Smith', { exact: false }))
    assert.ok(screen.getByRole('option', { name: 'Git will manage' }))
    assert.ok(
      screen.getByRole('option', { name: 'GitHub Desktop will manage' })
    )
    fireEvent.change(screen.getByLabelText('Author identity source'), {
      target: { value: 'git' },
    })
    assert.deepStrictEqual(changed, ['git'])
  })

  it('edits the selected account independently of the other signed-in account', () => {
    const second = new Account(
      'bob',
      'https://api.github.com',
      '',
      [],
      '',
      102,
      'Bob'
    )
    const edits: Array<{ account: string; name: string }> = []
    render(
      <Git
        name="Global"
        email="global@example.com"
        defaultBranch="main"
        isLoadingGitConfig={false}
        accounts={[account, second]}
        authoringMode="desktop"
        manageExternalAppAuthors={false}
        managedAuthors={new Map()}
        onAuthoringModeChanged={() => {}}
        onManageExternalAppAuthorsChanged={() => {}}
        onManagedAuthorChanged={(a, author) =>
          edits.push({ account: a.login, name: author.name })
        }
        onNameChanged={() => {}}
        onEmailChanged={() => {}}
        onDefaultBranchChanged={() => {}}
        onEditGlobalGitConfig={() => {}}
        onSelectedTabIndexChanged={() => {}}
        onEnableGitHookEnvChanged={() => {}}
        onCacheGitHookEnvChanged={() => {}}
        onSelectedShellChanged={() => {}}
        enableGitHookEnv={false}
        cacheGitHookEnv={true}
        selectedShell="git-bash"
      />
    )
    fireEvent.change(screen.getByLabelText('Account'), {
      target: { value: 'https://api.github.com:102' },
    })
    assert.strictEqual(
      (screen.getByLabelText('Name') as HTMLInputElement).value,
      'Bob'
    )
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Bob Commit' },
    })
    assert.deepStrictEqual(edits, [{ account: 'bob', name: 'Bob Commit' }])
  })
})
