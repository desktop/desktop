import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent, within } from '../../helpers/ui/render'
import { Git } from '../../../src/ui/preferences/git'
import {
  CommitIdentityMode,
  ICommitIdentityEdit,
} from '../../../src/lib/managed-commit-identity'

function descriptionOf(element: HTMLElement) {
  const id = element.getAttribute('aria-describedby')
  assert.ok(id)
  return document.getElementById(id)?.textContent ?? ''
}

describe('managed authorship preferences', () => {
  function props(): React.ComponentProps<typeof Git> {
    return {
      name: 'Git name',
      email: 'git@example.com',
      defaultBranch: 'main',
      isLoadingGitConfig: false,
      accounts: [],
      commitIdentityMode: 'git',
      managedIdentities: [
        {
          endpoint: 'https://api.github.com',
          login: 'alice',
          name: 'Managed name',
          email: 'managed@example.com',
          nameOverridden: false,
          emailOverridden: false,
        },
      ],
      onCommitIdentityModeChanged: (_mode: CommitIdentityMode) => {},
      onManagedIdentityChanged: (_edit: ICommitIdentityEdit) => {},
      onNameChanged: () => {},
      onEmailChanged: () => {},
      onDefaultBranchChanged: () => {},
      onEditGlobalGitConfig: () => {},
      onSelectedTabIndexChanged: () => {},
      onEnableGitHookEnvChanged: () => {},
      onCacheGitHookEnvChanged: () => {},
      onSelectedShellChanged: () => {},
      enableGitHookEnv: false,
      cacheGitHookEnv: true,
      selectedShell: 'bash',
    }
  }

  it('keeps Git configuration controls in Git mode and makes Desktop management explicit', () => {
    let selected: CommitIdentityMode = 'git'
    render(
      <Git
        {...props()}
        onCommitIdentityModeChanged={mode => {
          selected = mode
        }}
      />
    )
    const radio = screen.getByRole('radio', { name: 'Use Git configuration' })
    assert.ok(radio instanceof HTMLInputElement && radio.checked)
    assert.match(
      descriptionOf(radio),
      /Changes here update your global Git config/
    )
    const desktopRadio = screen.getByRole('radio', {
      name: 'Use a separate identity for each account',
    })
    assert.match(
      descriptionOf(desktopRadio),
      /GitHub Desktop doesn't change your Git config/
    )
    assert.ok(screen.getByDisplayValue('Git name'))
    assert.equal(screen.queryByDisplayValue('Managed name'), null)
    fireEvent.click(desktopRadio)
    assert.equal(selected, 'desktop')
  })

  it('shows compact rows and edits one signed-out identity in place', () => {
    const edits: ICommitIdentityEdit[] = []
    render(
      <Git
        {...props()}
        commitIdentityMode="desktop"
        onManagedIdentityChanged={edit => edits.push(edit)}
      />
    )
    assert.equal(screen.queryByDisplayValue('Git name'), null)
    assert.equal(screen.queryByRole('textbox'), null)
    const row = screen.getByRole('listitem')
    assert.ok(within(row).getByText('Managed name'))
    assert.ok(within(row).getByText('managed@example.com'))
    assert.ok(within(row).getByText('@alice'))
    assert.ok(within(row).getByText('Signed out'))

    const edit = screen.getByRole('button', {
      name: 'Edit @alice on GitHub.com',
    })
    assert.equal(edit.getAttribute('aria-expanded'), 'false')
    fireEvent.click(edit)
    const done = screen.getByRole('button', {
      name: 'Done editing @alice on GitHub.com',
    })
    assert.equal(done.getAttribute('aria-expanded'), 'true')
    assert.equal(document.activeElement, screen.getByLabelText('Name'))
    assert.equal(screen.getAllByText('From your profile').length, 2)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'edited@example.com' },
    })
    assert.deepEqual(edits, [
      {
        endpoint: 'https://api.github.com',
        login: 'alice',
        email: 'edited@example.com',
      },
    ])
    assert.ok(
      screen.getByText(/Other apps and unassigned repositories keep using/)
    )

    fireEvent.click(done)
    assert.equal(screen.queryByRole('textbox'), null)
  })

  it('expands only one identity at a time and marks custom fields', () => {
    const initial = props()
    const alice = initial.managedIdentities[0]
    render(
      <Git
        {...initial}
        commitIdentityMode="desktop"
        managedIdentities={[
          alice,
          {
            ...alice,
            endpoint: 'https://ghe.example.com/api/v3',
            login: 'bob',
            name: 'Bob',
            nameOverridden: true,
          },
        ]}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit @alice on GitHub.com' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit @bob on ghe.example.com' })
    )
    assert.equal(screen.getAllByLabelText('Name').length, 1)
    assert.ok(screen.getByDisplayValue('Bob'))
    assert.ok(screen.getByText('Custom'))
    assert.ok(screen.getByText('From your profile'))
    assert.ok(screen.getByRole('button', { name: 'Edit @alice on GitHub.com' }))
  })

  it('explains each invalid field and flags the collapsed row', () => {
    const initial = props()
    render(
      <Git
        {...initial}
        commitIdentityMode="desktop"
        managedIdentities={[
          { ...initial.managedIdentities[0], name: ' ', email: 'a <b>' },
        ]}
      />
    )
    assert.ok(screen.getByText('Needs a valid name and email'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit @alice on GitHub.com' })
    )
    assert.equal(screen.queryByText('Needs a valid name and email'), null)
    const nameError = screen.getByText('Enter a name.', {
      selector: '.input-description-content',
    })
    const emailError = screen.getByText(
      'Email can’t contain angle brackets or line breaks.',
      { selector: '.input-description-content' }
    )
    assert.equal(
      screen.getByLabelText('Name').getAttribute('aria-describedby'),
      nameError.parentElement?.id
    )
    assert.equal(
      screen.getByLabelText('Email').getAttribute('aria-describedby'),
      emailError.parentElement?.id
    )
  })
})
