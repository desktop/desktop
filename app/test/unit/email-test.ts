import { expect } from 'chai'

import { IEmail } from '../../src/models/email'
import { lookupPreferredEmail } from '../../src/lib/email'

describe('emails', () => {
  it('returns null for empty list', () => {
    expect(lookupPreferredEmail([])).to.equal(null)
  })

  it('looks for noreply email first', () => {
    const emails: IEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
      },
      {
        email: 'shiftkey@users.noreply.github.com',
        primary: false,
        verified: true,
      },
      {
        email: 'my-primary-email@example.com',
        primary: true,
        verified: true,
      },
    ]

    const result = lookupPreferredEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('shiftkey@users.noreply.github.com')
  })

  it('uses primary if noreply not set', () => {
    const emails: IEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
      },
      {
        email: 'github-primary@example.com',
        primary: true,
        verified: true,
      },
    ]

    const result = lookupPreferredEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('github-primary@example.com')
  })

  it('uses first email if nothing special found', () => {
    const emails: IEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
      },
      {
        email: 'github-primary@example.com',
        primary: false,
        verified: true,
      },
    ]

    const result = lookupPreferredEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('shiftkey@example.com')
  })
})
