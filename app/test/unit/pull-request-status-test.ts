import { expect } from 'chai'

import { APIRefState } from '../../src/lib/api'
import { getSummary } from '../../src/ui/branches/pull-request-status'

describe('pull request status', () => {
  it('uses the state when no statuses found', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: <APIRefState>'success',
      totalCount: 0,
      sha: '',
      statuses: [],
    }
    expect(getSummary(prStatus)).to.equal('SUCCESS')
  })

  it('reads the statuses when they are populated', () => {
    const prStatus = {
      pullRequestNumber: 23,
      state: <APIRefState>'success',
      totalCount: 0,
      sha: '',
      statuses: [
        { id: 1, state: <APIRefState>'success' },
        { id: 2, state: <APIRefState>'success' },
      ],
    }
    expect(getSummary(prStatus)).to.equal('2/2 checks OK')
  })
})
