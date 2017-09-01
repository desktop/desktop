import { expect } from 'chai'

import { lookupPreferredEmail } from '../../src/lib/email'
import { IAPIEmail } from '../../src/lib/api'

describe('emails', () => {
  it('returns null for empty list', () => {
    expect(lookupPreferredEmail([])).to.equal(null)
  })

  it('looks for noreply email first', () => {
    const emails: IAPIEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
        visibility: null,
      },
      {
        email: 'shiftkey@users.noreply.github.com',
        primary: false,
        verified: true,
        visibility: null,
      },
      {
        email: 'my-primary-email@example.com',
        primary: true,
        verified: true,
        visibility: null,
      },
    ]

    const result = lookupPreferredEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('shiftkey@users.noreply.github.com')
  })

  it('uses primary if noreply not set', () => {
    const emails: IAPIEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
        visibility: null,
      },
      {
        email: 'github-primary@example.com',
        primary: true,
        verified: true,
        visibility: null,
      },
    ]

    const result = lookupPreferredEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('github-primary@example.com')
  })

  it('uses first email if nothing special found', () => {
    const emails: IAPIEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
        visibility: null,
      },
      {
        email: 'github-primary@example.com',
        primary: false,
        verified: true,
        visibility: null,
      },
    ]

    const result = lookupPreferredEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('shiftkey@example.com')
  })
})
