import * as React from 'react'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { Git } from '../../../src/ui/preferences/git'
import { Account } from '../../../src/models/account'

const account = new Account(
  'work',
  'https://api.github.com',
  '',
  [],
  '',
  1,
  'Work'
)

describe('Git authorship preferences', () => {
  it('defaults to Git-managed and exposes per-account edits in Desktop mode', () => {
    const changes: string[] = []
    const common = {
      name: 'Global',
      email: 'global@example.com',
      defaultBranch: 'main',
      isLoadingGitConfig: false,
      accounts: [account],
      knownAccounts: [account],
      externalManaged: false,
      managedAuthors: [
        {
          identity: { endpoint: account.endpoint, id: account.id },
          author: { name: 'Work', email: 'work@example.com' },
        },
      ],
      onNameChanged: () => {},
      onEmailChanged: () => {},
      onDefaultBranchChanged: () => {},
      onEditGlobalGitConfig: () => {},
      onSelectedTabIndexChanged: () => {},
      onEnableGitHookEnvChanged: () => {},
      onCacheGitHookEnvChanged: () => {},
      onSelectedShellChanged: () => {},
      onDesktopManagedChanged: (enabled: boolean) =>
        changes.push(`mode:${enabled}`),
      onExternalManagedChanged: () => {},
      onManagedAuthorChanged: (
        _identity: { readonly endpoint: string; readonly id: number },
        field: 'name' | 'email',
        value: string
      ) => changes.push(`${field}:${value}`),
      enableGitHookEnv: false,
      cacheGitHookEnv: false,
      selectedShell: 'git-bash',
    }
    const view = render(<Git {...common} desktopManaged={false} />)
    assert.ok(screen.getByText(/These preferences will/))
    assert.strictEqual(screen.queryByDisplayValue('Work'), null)

    const mode = screen.getByLabelText('Commit authorship')
    fireEvent.change(mode, { target: { value: 'desktop' } })
    assert.deepStrictEqual(changes, ['mode:true'])

    view.rerender(<Git {...common} desktopManaged={true} />)
    assert.ok(screen.getByDisplayValue('Work'))
    fireEvent.change(screen.getByDisplayValue('Work'), {
      target: { value: 'Edited' },
    })
    assert.deepStrictEqual(changes, ['mode:true', 'name:Edited'])
  })
})
