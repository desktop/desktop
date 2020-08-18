import { APIRefState } from '../../src/lib/api'
import { getRefStatusSummary } from '../../src/ui/branches/pull-request-status'
import { ICombinedRefStatus } from '../../src/lib/stores/commit-status-store'

const failure: APIRefState = 'failure'
const pending: APIRefState = 'pending'
const success: APIRefState = 'success'

describe('pull request status', () => {
  it('uses the state when no statuses found', () => {
    const status: ICombinedRefStatus = {
      state: success,
      checks: [],
    }
    expect(getRefStatusSummary(status)).toBe('Commit status: success')
  })

  it('changes the failure message to something more friendly', () => {
    const status: ICombinedRefStatus = {
      state: failure,
      checks: [],
    }
    expect(getRefStatusSummary(status)).toBe('Commit status: failed')
  })

  it('reads the statuses when they are populated', () => {
    const status: ICombinedRefStatus = {
      state: success,
      checks: [
        {
          state: success,
          name: '1',
          description: 'first',
        },
        {
          state: success,
          name: '2',
          description: 'second',
        },
      ],
    }
    expect(getRefStatusSummary(status)).toBe('2/2 checks OK')
  })

  it('a successful status shows the description', () => {
    const status: ICombinedRefStatus = {
      state: success,
      checks: [
        {
          state: success,
          name: 'travis',
          description: 'The Travis CI build passed',
        },
      ],
    }

    expect(getRefStatusSummary(status)).toBe(
      'travis: The Travis CI build passed'
    )
  })

  it('an error status shows the description', () => {
    const status: ICombinedRefStatus = {
      state: failure,
      checks: [
        {
          state: failure,
          name: 'travis',
          description: 'The Travis CI build failed',
        },
      ],
    }

    expect(getRefStatusSummary(status)).toBe(
      'travis: The Travis CI build failed'
    )
  })

  it('only counts the successful statuses', () => {
    const status: ICombinedRefStatus = {
      state: success,
      checks: [
        {
          state: success,
          description: 'first',
          name: '1',
        },
        {
          state: pending,
          description: 'second',
          name: '2',
        },
        {
          state: pending,
          description: 'third',
          name: '3',
        },
      ],
    }

    expect(getRefStatusSummary(status)).toBe('1/3 checks OK')
  })
})
