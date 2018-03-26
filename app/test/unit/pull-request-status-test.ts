import { expect } from 'chai'

import { APIRefState } from '../../src/lib/api'
import { getSummary } from '../../src/ui/branches/pull-request-status'

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
    expect(getSummary(prStatus)).to.equal('success')
  })

  it('changes the failure message to something more friendly', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: failure,
      totalCount: 0,
      sha: '',
      statuses: [],
    }
    expect(getSummary(prStatus)).to.equal('failed')
  })

  it('reads the statuses when they are populated', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 0,
      sha: '',
      statuses: [{ id: 1, state: success }, { id: 2, state: success }],
    }
    expect(getSummary(prStatus)).to.equal('2/2 checks OK')
  })

  it('only counts the successful statuses', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: success,
      totalCount: 0,
      sha: '',
      statuses: [
        { id: 1, state: success },
        { id: 2, state: pending },
        { id: 2, state: pending },
      ],
    }
    expect(getSummary(prStatus)).to.equal('1/3 checks OK')
  })
})
