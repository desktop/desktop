import assert from 'node:assert/strict'
import { describe, it, TestContext } from 'node:test'
import * as React from 'react'
import { rm, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  RepositorySettings,
  RepositorySettingsTab,
} from '../../../src/ui/repository-settings/repository-settings'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { rawGit, seed } from '../../helpers/assisted-commit'
import { isolateGitConfig } from '../../helpers/git-config'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

async function setup(t: TestContext) {
  await isolateGitConfig(t)
  const source = await seed(t, { file: 'before\n' })
  for (const [key, value] of [
    ['user.name', 'Original User'],
    ['user.email', 'original@example.invalid'],
  ]) {
    await rawGit(source, ['config', '--local', key, value])
  }
  await rawGit(source, ['config', '--global', 'user.name', 'Global User'])
  await rawGit(source, [
    'config',
    '--global',
    'user.email',
    'global@example.invalid',
  ])
  const identities = [
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
  ]
  const previous = identities.map(key => ({ key, value: process.env[key] }))
  for (const key of identities) {
    delete process.env[key]
  }
  t.after(() => {
    for (const { key, value } of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
  const h = await createAssistedCommitRunHarness(t)
  t.mock.method(
    h.dispatcher,
    'updateRepositoryWorkflowPreferences',
    async () => {}
  )
  const repository = await h.register(source)
  await h.dispatcher.refreshAuthor(repository)
  const refresh = t.mock.method(h.dispatcher, 'refreshAuthor')
  const update = t.mock.method(h.dispatcher, 'updateRepositoryCommitter')
  const dismissed = t.mock.fn()
  render(
    <RepositorySettings
      repository={repository}
      dispatcher={h.dispatcher}
      remote={null}
      repositoryAccount={null}
      initialSelectedTab={RepositorySettingsTab.GitConfig}
      onDismissed={dismissed}
    />
  )
  await waitFor(() => {
    const name = screen.getByLabelText('Name')
    assert.ok(name instanceof HTMLInputElement)
    assert.equal(name.value, 'Original User')
  })
  return { ...h, repository, refresh, update, dismissed }
}

describe('repository settings Git identity refresh', () => {
  for (const action of ['update-local', 'use-global'] as const) {
    it(`refreshes the author after a real partial config write failure (${action})`, async t => {
      const h = await setup(t)
      const lockPath = join(h.repository.path, '.git', 'config.lock')
      t.after(() => rm(lockPath, { force: true }))
      const updateValue = h.appStore['updateRepositoryCommitterValue'].bind(
        h.appStore
      )
      let blockedEmail = false
      h.appStore['updateRepositoryCommitterValue'] = async (...args) => {
        await updateValue(...args)
        if (args[1] === 'user.name') {
          blockedEmail = true
          await writeFile(
            lockPath,
            'Injected config lock before the email write\n'
          )
        }
      }
      if (action === 'update-local') {
        fireEvent.change(screen.getByLabelText('Name'), {
          target: { value: 'Changed User' },
        })
        fireEvent.change(screen.getByLabelText('Email'), {
          target: { value: 'changed@example.invalid' },
        })
      } else {
        fireEvent.click(screen.getByLabelText('Use my global Git config'))
      }
      fireEvent.click(
        screen.getByRole('button', { name: 'Save', hidden: true })
      )
      await screen.findByText(/Failed updating Git identity:/)
      assert.equal(
        blockedEmail,
        true,
        'The first real write must finish before the email fails'
      )
      assert.equal(h.update.mock.callCount(), 1)
      assert.equal(
        await rawGit(h.repository, ['config', '--get', 'user.name']),
        action === 'update-local' ? 'Changed User' : 'Global User'
      )
      assert.equal(
        await rawGit(h.repository, [
          'config',
          '--local',
          '--get',
          'user.email',
        ]),
        'original@example.invalid'
      )
      assert.equal(h.refresh.mock.callCount(), 1)
      await h.refresh.mock.calls[0].result
      assert.equal(
        h.state(h.repository).commitAuthor?.name,
        action === 'update-local' ? 'Changed User' : 'Global User'
      )
      assert.equal(
        h.state(h.repository).commitAuthor?.email,
        'original@example.invalid'
      )
      assert.equal(h.dismissed.mock.callCount(), 0)
      assert.notEqual(
        screen
          .getByRole('button', { name: 'Save', hidden: true })
          .getAttribute('aria-disabled'),
        'true'
      )
    })
  }

  it('does not write or refresh an unchanged local identity', async t => {
    const h = await setup(t)
    fireEvent.click(screen.getByRole('button', { name: 'Save', hidden: true }))
    await waitFor(() => assert.equal(h.dismissed.mock.callCount(), 1))
    assert.equal(h.update.mock.callCount(), 0)
    assert.equal(h.refresh.mock.callCount(), 0)
  })
})
