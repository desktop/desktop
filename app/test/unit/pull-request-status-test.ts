import { APIRefState } from '../../src/lib/api'
import { getRefStatusSummary } from '../../src/ui/branches/pull-request-status'

const failure: APIRefState = 'failure'
const pending: APIRefState = 'pending'
const success: APIRefState = 'success'

describe('pull request status', () => {
  it('uses the state when no statuses found', () => {
    const status = {
      state: success,
      total_count: 0,
      sha: '',
      statuses: [],
    }
    expect(getRefStatusSummary(status)).toBe('Commit status: success')
  })

  it('changes the failure message to something more friendly', () => {
    const status = {
      state: failure,
      total_count: 0,
      sha: '',
      statuses: [],
    }
    expect(getRefStatusSummary(status)).toBe('Commit status: failed')
  })

  it('reads the statuses when they are populated', () => {
    const status = {
      state: success,
      total_count: 2,
      sha: '',
      statuses: [
        {
          id: 1,
          state: success,
          description: 'first',
          target_url: '',
          context: '2',
        },
        {
          id: 2,
          state: success,
          description: 'second',
          target_url: '',
          context: '2',
        },
      ],
    }
    expect(getRefStatusSummary(status)).toBe('2/2 checks OK')
  })

  it('a successful status shows the description', () => {
    const status = {
      state: success,
      total_count: 2,
      sha: '',
      statuses: [
        {
          id: 1,
          state: success,
          description: 'The Travis CI build passed',
          target_url: '',
          context: '1',
        },
      ],
    }
    expect(getRefStatusSummary(status)).toBe(
      'Success: The Travis CI build passed'
    )
  })

  it('an error status shows the description', () => {
    const status = {
      state: success,
      total_count: 2,
      sha: '',
      statuses: [
        {
          id: 1,
          state: failure,
          description: 'The Travis CI build failed',
          target_url: '',
          context: '1',
        },
      ],
    }
    expect(getRefStatusSummary(status)).toBe(
      'Failure: The Travis CI build failed'
    )
  })

  it('only counts the successful statuses', () => {
    const status = {
      state: success,
      total_count: 3,
      sha: '',
      statuses: [
        {
          id: 1,
          state: success,
          description: 'first',
          target_url: '',
          context: '1',
        },
        {
          id: 2,
          state: pending,
          description: 'second',
          target_url: '',
          context: '2',
        },
        {
          id: 2,
          state: pending,
          description: 'third',
          target_url: '',
          context: '3',
        },
      ],
    }
    expect(getRefStatusSummary(status)).toBe('1/3 checks OK')
  })
})
