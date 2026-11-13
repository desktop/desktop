import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  withGitExecutionEnvironment,
  withLocalGitEnvironment,
} from '../../../src/lib/git/execution-environment'

describe('local-only Git host environment', () => {
  it('preserves explicit operation overrides without invoking application services', async () => {
    const result = await withLocalGitEnvironment(
      { HOST_SENTINEL: 'host', SHARED_SENTINEL: 'host' },
      () =>
        withGitExecutionEnvironment(
          async environment => environment,
          '/unused-fixture-path',
          {
            env: {
              OPERATION_SENTINEL: 'operation',
              SHARED_SENTINEL: 'operation',
            },
          }
        )
    )
    assert.deepStrictEqual(result, {
      HOST_SENTINEL: 'host',
      OPERATION_SENTINEL: 'operation',
      SHARED_SENTINEL: 'operation',
    })
  })

  it('keeps overlapping asynchronous hosts isolated and restores nested hosts', async () => {
    const observe = () =>
      withGitExecutionEnvironment(
        async environment => environment.HOST_SENTINEL,
        '/unused-fixture-path'
      )
    const results = await Promise.all(
      ['first', 'second'].map(value =>
        withLocalGitEnvironment({ HOST_SENTINEL: value }, async () => {
          await new Promise(resolve => setImmediate(resolve))
          assert.strictEqual(await observe(), value)
          await withLocalGitEnvironment(
            { HOST_SENTINEL: 'nested' },
            async () => {
              await new Promise(resolve => setImmediate(resolve))
              assert.strictEqual(await observe(), 'nested')
            }
          )
          return observe()
        })
      )
    )
    assert.deepStrictEqual(results, ['first', 'second'])
  })

  it('rejects intercepted hooks instead of silently bypassing them', async () => {
    await assert.rejects(
      withLocalGitEnvironment({}, () =>
        withGitExecutionEnvironment(
          async () => assert.fail('Unexpected Git execution'),
          '/unused-fixture-path',
          { interceptHooks: ['pre-commit'] }
        )
      ),
      /cannot request application hooks or credentials/
    )
  })
})
