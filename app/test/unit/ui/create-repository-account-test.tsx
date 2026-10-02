import assert from 'node:assert'
import { it } from 'node:test'
import * as React from 'react'
import { Account } from '../../../src/models/account'
import { CreateRepository } from '../../../src/ui/add-repository/create-repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { setDefaultDir } from '../../../src/ui/lib/default-dir'
import { fireEvent, render, screen } from '../../helpers/ui/render'

class CreateRepositoryWithoutAssetLoading extends CreateRepository {
  public async componentDidMount() {}
}

it('defaults Create Repository to No account and allows choosing a signed-in account', async t => {
  const electron = await import('electron')
  const originalSend = electron.ipcRenderer.send
  const originalDefaultDir = localStorage.getItem('last-clone-location')
  setDefaultDir(process.cwd())
  electron.ipcRenderer.send = () => {}
  t.after(() => {
    electron.ipcRenderer.send = originalSend
    if (originalDefaultDir === null) {
      localStorage.removeItem('last-clone-location')
    } else {
      setDefaultDir(originalDefaultDir)
    }
  })
  const account = new Account(
    'alice',
    'https://api.github.com',
    'token',
    [],
    '',
    1,
    'Alice'
  )
  render(
    <CreateRepositoryWithoutAssetLoading
      dispatcher={{} as Dispatcher}
      onDismissed={t.mock.fn()}
      accounts={[account]}
      isTopMost={false}
    />
  )
  const picker = screen.getByRole('combobox', { name: 'Account', hidden: true })
  assert.ok(picker instanceof HTMLSelectElement)
  assert.strictEqual(picker.value, '')
  assert.ok(screen.getByRole('option', { name: 'No account', hidden: true }))
  assert.equal(
    screen.queryByRole('textbox', {
      name: /commit name|commit email/i,
      hidden: true,
    }),
    null
  )
  fireEvent.change(picker, { target: { value: '0' } })
  assert.strictEqual(picker.value, '0')
})
