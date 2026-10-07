import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import { join } from 'path'
import { unlink, writeFile } from 'fs/promises'
import * as React from 'react'
import type { CreateRepository as CreateRepositoryComponent } from '../../../src/ui/add-repository/create-repository'
import * as GitIgnores from '../../../src/ui/add-repository/gitignores'
import * as Licenses from '../../../src/ui/add-repository/licenses'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { count, optionalBytes, seed } from '../../helpers/assisted-commit'
import {
  deferred,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { pathExists } from '../../../src/lib/path-exists'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let creation: typeof import('../../../src/ui/add-repository/create-repository')

before(async () => {
  mock.module('../../../src/ui/add-repository/gitignores.ts', {
    namedExports: { ...GitIgnores, getGitIgnoreNames: async () => [] },
  })
  mock.module('../../../src/ui/add-repository/licenses.ts', {
    namedExports: { ...Licenses, getLicenses: async () => [] },
  })
  creation = await import('../../../src/ui/add-repository/create-repository')
})

describe('repository creation during assisted runs', () => {
  it('keeps creation reserved after dialog unmount through registration, templates and native initial commit', async t => {
    const source = await seed(t, { 'nested/README.md': 'initial\n' })
    await writeFile(join(source.path, 'nested/README.md'), 'selected edits\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    t.mock.method(h.appStore, '_selectRepository', async () => {})
    const root = join(repository.path, 'nested')
    const ref = React.createRef<CreateRepositoryComponent>()
    const view = render(
      <creation.CreateRepository
        ref={ref}
        dispatcher={h.dispatcher}
        initialPath={root}
        onDismissed={() => {}}
        isTopMost={true}
      />
    )
    await waitFor(() => assert.strictEqual(ref.current?.state.fullPath, root))
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Initialize this repository with a README',
        hidden: true,
      })
    )
    const component = ref.current
    assert.ok(component !== null)
    const registered = deferred<void>()
    const finishRegistration = deferred<void>()
    const add = h.dispatcher.addRepositories.bind(h.dispatcher)
    h.dispatcher.addRepositories = async paths => {
      const added = await add(paths)
      registered.resolve()
      await finishRegistration.promise
      return added
    }
    const creating = component['createRepository']()
    await registered.promise
    view.unmount()
    const planning = deferred<void>()
    const finishPlanning = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      planning.resolve()
      await finishPlanning.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const admission = await Promise.race([
      planning.promise.then(() => 'planning'),
      operation.then(outcome => outcome.kind),
    ])
    finishRegistration.resolve()
    try {
      await waitFor(async () => {
        assert.match(
          (await optionalBytes(join(root, 'README.md')))?.toString() ?? '',
          /^# nested/
        )
      })
    } finally {
      finishPlanning.resolve()
      await operation
      await creating
    }
    assert.strictEqual(admission, 'busy')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
    assert.match(
      (await optionalBytes(join(root, 'README.md')))?.toString() ?? '',
      /^# nested/
    )
  })

  it('disables protected creation and rejects it before mkdir can replace a selected deleted path', async t => {
    const source = await seed(t, { gone: 'selected deletion\n' })
    await unlink(join(source.path, 'gone'))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const errors: Error[] = []
    t.mock.method(h.dispatcher, 'postError', (error: Error) => {
      errors.push(error)
    })
    const entered = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    const root = join(repository.path, 'gone')
    const ref = React.createRef<CreateRepositoryComponent>()
    const view = render(
      <creation.CreateRepository
        ref={ref}
        dispatcher={h.dispatcher}
        initialPath={root}
        onDismissed={() => {}}
        isTopMost={true}
      />
    )
    try {
      await waitFor(() => assert.strictEqual(ref.current?.state.fullPath, root))
      const button = screen.getByRole('button', {
        name: /Create repository/i,
        hidden: true,
      })
      const disabled = button.getAttribute('aria-disabled')
      const component = ref.current
      assert.ok(component !== null)
      await component['createRepository']()
      const created = await pathExists(root)
      assert.strictEqual(disabled, 'true')
      assert.strictEqual(created, false)
    } finally {
      view.unmount()
      h.cancel(repository)
      finish.resolve()
      await operation
    }
    assert.strictEqual(await pathExists(root), false)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(errors.length, 1)
    assert.match(errors[0].message, /assisted commit run/)
  })
})
