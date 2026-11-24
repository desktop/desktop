import assert from 'node:assert/strict'
import { after, before, describe, it, mock } from 'node:test'
import type { IGitStringExecutionOptions } from '../../../src/lib/git/core'
import type { clone } from '../../../src/lib/git/clone'

describe('clone fallback account', () => {
  let cloneRepository: typeof clone
  let executionOptions: IGitStringExecutionOptions | undefined

  before(async () => {
    mock.module('../../../src/lib/git/core', {
      namedExports: {
        git: async (
          _args: ReadonlyArray<string>,
          _path: string,
          _name: string,
          options: IGitStringExecutionOptions
        ) => {
          executionOptions = options
        },
      },
    })
    mock.module('../../../src/lib/git/environment', {
      namedExports: { envForRemoteOperation: async () => ({}) },
    })
    cloneRepository = (await import('../../../src/lib/git/clone')).clone
  })
  after(() => mock.restoreAll())

  it('passes the fallback account as an execution option', async () => {
    const account = { endpoint: 'https://api.github.com', login: 'bob' }
    await cloneRepository('https://github.com/owner/repo', '/tmp/clone-test', {
      defaultBranch: 'main',
      fallbackAccount: account,
    })
    assert.deepStrictEqual(executionOptions?.fallbackAccount, account)
  })

  it('omits the fallback account for an unassigned clone', async () => {
    await cloneRepository('https://github.com/owner/repo', '/tmp/clone-test', {
      defaultBranch: 'main',
    })
    assert.strictEqual(executionOptions?.fallbackAccount, undefined)
  })
})
