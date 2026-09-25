import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import { Account } from '../../src/models/account'
import { CloneOptions } from '../../src/models/clone-options'
import type { IAccessibleRepository } from '../../src/lib/repository-matching'
import type { CloningRepositoriesStore } from '../../src/lib/stores/cloning-repositories-store'
import { createMockAPIRepository } from '../helpers/mock-api'

describe('CloningRepositoriesStore account selection', () => {
  let createStore: () => CloningRepositoriesStore
  const clonedOptions: CloneOptions[] = []
  const assignment: IAccessibleRepository = {
    owner: 'owner',
    name: 'repo',
    account: new Account(
      'alice',
      'https://api.github.com',
      'secret-token',
      [],
      '',
      1,
      ''
    ),
    apiRepository: { ...createMockAPIRepository(), parent: undefined },
  }

  before(async () => {
    mock.module('../../src/lib/git', {
      namedExports: {
        clone: async (_url: string, _path: string, options: CloneOptions) => {
          clonedOptions.push(options)
        },
      },
    })
    const { CloningRepositoriesStore } = await import(
      '../../src/lib/stores/cloning-repositories-store'
    )
    createStore = () => new CloningRepositoriesStore()
  })
  beforeEach(() => {
    clonedOptions.length = 0
  })
  after(() => mock.restoreAll())

  it('registers the clone before prompting and passes only the chosen identity', async () => {
    const store = createStore()
    const promise = store.clone(
      'https://github.com/owner/repo',
      '/repo',
      { branch: 'feature' },
      async () => {
        assert.strictEqual(store.repositories.length, 1)
        assert.strictEqual(clonedOptions.length, 0)
        return assignment
      }
    )
    assert.strictEqual(store.repositories.length, 1)
    assert.strictEqual(await promise, true)
    assert.deepStrictEqual(clonedOptions, [
      {
        branch: 'feature',
        fallbackAccount: { endpoint: 'https://api.github.com', login: 'alice' },
      },
    ])
    assert.strictEqual(
      JSON.stringify(clonedOptions).includes('secret-token'),
      false
    )
    assert.strictEqual(store.takeCompletedAssignment('/repo'), assignment)
    assert.strictEqual(store.takeCompletedAssignment('/repo'), undefined)
    assert.strictEqual(store.repositories.length, 0)
  })

  it('retains an explicit null assignment without inheriting retry credentials', async () => {
    const store = createStore()
    assert.strictEqual(
      await store.clone(
        'https://github.com/owner/repo',
        '/repo',
        {
          fallbackAccount: { endpoint: 'https://api.github.com', login: 'old' },
        },
        async () => null
      ),
      true
    )
    assert.deepStrictEqual(clonedOptions, [{ fallbackAccount: undefined }])
    assert.strictEqual(store.takeCompletedAssignment('/repo'), null)
  })

  it('does not clone or retain an assignment after canceling the chooser', async () => {
    const store = createStore()
    assert.strictEqual(
      await store.clone(
        'https://github.com/owner/repo',
        '/repo',
        {},
        async () => undefined
      ),
      false
    )
    assert.deepStrictEqual(clonedOptions, [])
    assert.strictEqual(store.takeCompletedAssignment('/repo'), undefined)
    assert.strictEqual(store.repositories.length, 0)
  })
})
