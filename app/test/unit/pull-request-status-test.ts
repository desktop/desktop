import { expect } from 'chai'

import { APIRefState } from '../../src/lib/api'
import { getPRStatusSummary } from '../../src/ui/branches/pull-request-status'

const failure: APIRefState = 'failure'
const pending: APIRefState = 'pending'
const success: APIRefState = 'success'

describe('pull request status', () => {
  it('uses the state when no statuses found', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 0,
      sha: '',
      statuses: [],
    }
    expect(getPRStatusSummary(prStatus)).to.equal('Commit status: success')
  })

  it('changes the failure message to something more friendly', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: failure,
      totalCount: 0,
      sha: '',
      statuses: [],
    }
    expect(getPRStatusSummary(prStatus)).to.equal('Commit status: failed')
  })

  it('reads the statuses when they are populated', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 2,
      sha: '',
      statuses: [
        { id: 1, state: success, description: 'first' },
        { id: 2, state: success, description: 'second' },
      ],
    }
    expect(getPRStatusSummary(prStatus)).to.equal('2/2 checks OK')
  })

  it('a successful status shows the description', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 2,
      sha: '',
      statuses: [
        { id: 1, state: success, description: 'The Travis CI build passed' },
      ],
    }
    expect(getPRStatusSummary(prStatus)).to.equal(
      'Success: The Travis CI build passed'
    )
  })

  it('an error status shows the description', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 2,
      sha: '',
      statuses: [
        { id: 1, state: failure, description: 'The Travis CI build failed' },
      ],
    }
    expect(getPRStatusSummary(prStatus)).to.equal(
      'Failure: The Travis CI build failed'
    )
  })

  it('only counts the successful statuses', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 3,
      sha: '',
      statuses: [
        { id: 1, state: success, description: 'first' },
        { id: 2, state: pending, description: 'second' },
        { id: 2, state: pending, description: 'third' },
      ],
    }
    expect(getPRStatusSummary(prStatus)).to.equal('1/3 checks OK')
  })
})
