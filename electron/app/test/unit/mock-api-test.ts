import { describe, it } from 'node:test'
import assert from 'node:assert'

import { createMockAPI, createMockAPIRepository } from '../helpers/mock-api'

describe('mock-api', () => {
  it('rejects unmocked API methods instead of attempting a real request', async () => {
    const api = createMockAPI()

    await assert.rejects(
      api.fetchRepository('desktop', 'desktop'),
      /No mock implementation registered for API\.fetchRepository/
    )
  })

  it('uses provided method overrides', async () => {
    const repository = {
      ...createMockAPIRepository({ name: 'mocked-repo' }),
      parent: undefined,
    }
    const api = createMockAPI({
      fetchRepository: async () => repository,
    })

    const result = await api.fetchRepository('desktop', 'desktop')

    assert.equal(result?.name, 'mocked-repo')
  })
})
